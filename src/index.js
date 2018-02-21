import { WebAuth } from "auth0-js";
import { always, compose, merge, prop } from "ramda";
import { Observable } from "rxjs";
import either from "crocks/pointfree/either";
import {
  fromNullable,
  Failures,
  validateUser,
  callError,
  callNextComplete
} from "./helpers";

export default function CreateAuthModule({
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
        .swap(always(payloadCheck), Failures.Callback)
        .either(callError(obs), callNextComplete(obs));
    })
  );

  const checkSession = (options = {}) =>
    Observable.create(obs =>
      auth0.checkSession(options, (err, result) =>
        fromNullable(err)
          .swap(always(result), always(Failures.SSO))
          .map(res =>
            merge(res, { expiresAt: Date.now() + result.expiresIn * 1000 })
          )
          .either(callError(obs), callNextComplete(obs))
      )
    );

  const getUserInfo = result =>
    Observable.create(obs =>
      auth0.client.userInfo(result.accessToken, (err, profile) => {
        fromNullable(err)
          .swap(always(result), always(result))
          .map(user => merge(user, profile))
          .either(callError(obs), callNextComplete(obs));
      })
    ).catch(Observable.of);

  const authenticate = checkSession().flatMap(getUserInfo);

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

  const initialize = parseHash
    .flatMap(either(() => getUserFromStorage, getUserInfo))
    .flatMap(validateUser)
    .catch(err =>
      err.cata({
        Callback: compose(Observable.throw, Failures.Callback),
        SSO: () => Observable.throw(Failures.SSO),
        Expired: () => authenticate
      })
    )
    .flatMap(storeUser);

  const maintainLogin = initialize
    .flatMap(user =>
      Observable.empty()
        .delay(new Date(user.expiresAt - 10000))
        .startWith(user)
    )
    .repeatWhen(x => x);

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
  const getToken = () => getUserFromStorage.map(prop("access_token"));

  return {
    initialize,
    logout,
    login,
    maintainLogin,
    getToken
  };
}
