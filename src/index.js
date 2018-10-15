import { WebAuth } from "auth0-js";
import * as R from "ramda";
import { Observable, of, throwError, empty } from "rxjs";
import {
  delay,
  startWith,
  repeatWhen,
  mergeMap,
  catchError,
  map,
  zip
} from "rxjs/operators";
import either from "crocks/pointfree/either";
import {
  fromNullable,
  Failures,
  validateUser,
  callError,
  callNextComplete,
  calcExipryTime
} from "./helpers";

export default function createAuthModule({
  clientID,
  domain,
  redirectUri,
  apiAudience
}) {
  const auth0 = new WebAuth({
    audience: apiAudience,
    domain,
    clientID,
    scope: "openid profile email",
    redirectUri,
    responseType: "token"
  });

  const parseHash = Observable.create(obs =>
    auth0.parseHash((err, payload) => {
      const errCheck = fromNullable(err);
      const payloadCheck = fromNullable(payload);

      errCheck
        .swap(R.always(payloadCheck), Failures.Callback)
        .map(R.map(calcExipryTime))
        .either(callError(obs), callNextComplete(obs));
    })
  );

  const checkSession = (options = {}) =>
    Observable.create(obs =>
      auth0.checkSession(options, (err, result) =>
        fromNullable(err)
          .swap(R.always(result), R.always(Failures.SSO))
          .map(calcExipryTime)
          .either(callError(obs), callNextComplete(obs))
      )
    );

  const getUserInfo = result =>
    Observable.create(obs =>
      auth0.client.userInfo(result.accessToken, (err, profile) => {
        fromNullable(err)
          .swap(R.always(result), R.always(result))
          .map(user => R.merge(user, profile))
          .either(callError(obs), callNextComplete(obs));
      })
    ).pipe(catchError(of));

  const authenticate = checkSession().pipe(mergeMap(getUserInfo));

  const getUserFromStorage = Observable.create(obs => {
    const user = JSON.parse(localStorage.getItem("user")) || {};
    obs.next(user);
    obs.complete();
  });

  const storeUser = user =>
    Observable.create(obs => {
      localStorage.setItem("user", JSON.stringify(user));

      obs.next(user);
      obs.complete();
    });

  const initialize = parseHash.pipe(
    mergeMap(either(() => getUserFromStorage, getUserInfo)),
    mergeMap(validateUser),
    catchError(err =>
      err.cata({
        Callback: R.compose(
          throwError,
          Failures.Callback
        ),
        SSO: () => throwError(Failures.SSO),
        Expired: () => authenticate
      })
    ),
    mergeMap(storeUser)
  );

  const maintainLogin = initialize.pipe(
    mergeMap(user =>
      empty().pipe(
        delay(new Date(user.expiresAt - 10000)),
        startWith(user)
      )
    ),
    repeatWhen(x => x)
  );

  function logout({ returnUrl }) {
    const logoutFn = auth0.logout.bind(auth0, { returnTo: returnUrl });
    storeUser({}).subscribe(logoutFn);
  }

  function login() {
    auth0.authorize({
      redirectUri
    });
  }

  // () as placeholder for audience
  const getToken = api =>
    getUserFromStorage.pipe(
      map(api ? R.prop(api) : R.identity),
      mergeMap(validateUser),
      catchError(() =>
        checkSession({ audience: api }).pipe(
          map(R.objOf(api)),
          zip(getUserFromStorage, R.merge),
          mergeMap(storeUser),
          map(R.prop(api))
        )
      ),
      map(R.prop("accessToken"))
    );

  return {
    initialize,
    logout,
    login,
    maintainLogin,
    getToken
  };
}
