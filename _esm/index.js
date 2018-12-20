import { WebAuth } from "auth0-js";
import * as R from "ramda";
import { Observable, of, throwError, empty } from "rxjs";
import { delay, startWith, repeatWhen, mergeMap, catchError, map, zip } from "rxjs/operators";
import either from "crocks/pointfree/either";
import { fromNullable, Failures, validateUser, callError, callNextComplete, calcExipryTime } from "./helpers";

export default function createAuthModule(_ref) {
  var clientID = _ref.clientID,
      domain = _ref.domain,
      redirectUri = _ref.redirectUri,
      apiAudience = _ref.apiAudience;

  var auth0 = new WebAuth({
    audience: apiAudience,
    domain: domain,
    clientID: clientID,
    scope: "openid profile email",
    redirectUri: redirectUri,
    responseType: "token"
  });

  var parseHash = Observable.create(function (obs) {
    return auth0.parseHash(function (err, payload) {
      var errCheck = fromNullable(err);
      var payloadCheck = fromNullable(payload);

      errCheck.swap(R.always(payloadCheck), Failures.Callback).map(R.map(calcExipryTime)).either(callError(obs), callNextComplete(obs));
    });
  });

  var checkSession = function checkSession() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return Observable.create(function (obs) {
      return auth0.checkSession(options, function (err, result) {
        return fromNullable(err).swap(R.always(result), R.always(Failures.SSO)).map(calcExipryTime).either(callError(obs), callNextComplete(obs));
      });
    });
  };

  var getUserInfo = function getUserInfo(result) {
    return Observable.create(function (obs) {
      return auth0.client.userInfo(result.accessToken, function (err, profile) {
        fromNullable(err).swap(R.always(result), R.always(result)).map(function (user) {
          return R.merge(user, profile);
        }).either(callError(obs), callNextComplete(obs));
      });
    }).pipe(catchError(of));
  };

  var authenticate = checkSession().pipe(mergeMap(getUserInfo));

  var getUserFromStorage = Observable.create(function (obs) {
    var user = JSON.parse(localStorage.getItem("user")) || {};
    obs.next(user);
    obs.complete();
  });

  var storeUser = function storeUser(user) {
    return Observable.create(function (obs) {
      localStorage.setItem("user", JSON.stringify(user));

      obs.next(user);
      obs.complete();
    });
  };

  var initialize = parseHash.pipe(mergeMap(either(function () {
    return getUserFromStorage;
  }, getUserInfo)), mergeMap(validateUser), catchError(function (err) {
    return err.cata({
      Callback: R.compose(throwError, Failures.Callback),
      SSO: function SSO() {
        return throwError(Failures.SSO);
      },
      Expired: function Expired() {
        return authenticate;
      }
    });
  }), mergeMap(storeUser));

  var maintainLogin = initialize.pipe(mergeMap(function (user) {
    return empty().pipe(delay(new Date(user.expiresAt - 10000)), startWith(user));
  }), repeatWhen(function (x) {
    return x;
  }));

  function logout(_ref2) {
    var returnUrl = _ref2.returnUrl;

    var logoutFn = auth0.logout.bind(auth0, { returnTo: returnUrl });
    storeUser({}).subscribe(logoutFn);
  }

  function login(options) {
    auth0.authorize(Object.assign({}, options, {
      redirectUri: redirectUri
    }));
  }

  // () as placeholder for audience
  var getToken = function getToken(api) {
    return getUserFromStorage.pipe(map(api ? R.prop(api) : R.identity), mergeMap(validateUser), catchError(function () {
      return checkSession({ audience: api }).pipe(map(R.objOf(api)), zip(getUserFromStorage, R.merge), mergeMap(storeUser), map(R.prop(api)));
    }), map(R.prop("accessToken")));
  };

  return {
    initialize: initialize,
    logout: logout,
    login: login,
    maintainLogin: maintainLogin,
    getToken: getToken
  };
}