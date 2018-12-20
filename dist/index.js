"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createAuthModule;

var _auth0Js = require("auth0-js");

var _ramda = require("ramda");

var R = _interopRequireWildcard(_ramda);

var _rxjs = require("rxjs");

var _operators = require("rxjs/operators");

var _either = require("crocks/pointfree/either");

var _either2 = _interopRequireDefault(_either);

var _helpers = require("./helpers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function createAuthModule(_ref) {
  var clientID = _ref.clientID,
      domain = _ref.domain,
      redirectUri = _ref.redirectUri,
      apiAudience = _ref.apiAudience;

  var auth0 = new _auth0Js.WebAuth({
    audience: apiAudience,
    domain: domain,
    clientID: clientID,
    scope: "openid profile email",
    redirectUri: redirectUri,
    responseType: "token"
  });

  var parseHash = _rxjs.Observable.create(function (obs) {
    return auth0.parseHash(function (err, payload) {
      var errCheck = (0, _helpers.fromNullable)(err);
      var payloadCheck = (0, _helpers.fromNullable)(payload);

      errCheck.swap(R.always(payloadCheck), _helpers.Failures.Callback).map(R.map(_helpers.calcExipryTime)).either((0, _helpers.callError)(obs), (0, _helpers.callNextComplete)(obs));
    });
  });

  var checkSession = function checkSession() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return _rxjs.Observable.create(function (obs) {
      return auth0.checkSession(options, function (err, result) {
        return (0, _helpers.fromNullable)(err).swap(R.always(result), R.always(_helpers.Failures.SSO)).map(_helpers.calcExipryTime).either((0, _helpers.callError)(obs), (0, _helpers.callNextComplete)(obs));
      });
    });
  };

  var getUserInfo = function getUserInfo(result) {
    return _rxjs.Observable.create(function (obs) {
      return auth0.client.userInfo(result.accessToken, function (err, profile) {
        (0, _helpers.fromNullable)(err).swap(R.always(result), R.always(result)).map(function (user) {
          return R.merge(user, profile);
        }).either((0, _helpers.callError)(obs), (0, _helpers.callNextComplete)(obs));
      });
    }).pipe((0, _operators.catchError)(_rxjs.of));
  };

  var authenticate = checkSession().pipe((0, _operators.mergeMap)(getUserInfo));

  var getUserFromStorage = _rxjs.Observable.create(function (obs) {
    var user = JSON.parse(localStorage.getItem("user")) || {};
    obs.next(user);
    obs.complete();
  });

  var storeUser = function storeUser(user) {
    return _rxjs.Observable.create(function (obs) {
      localStorage.setItem("user", JSON.stringify(user));

      obs.next(user);
      obs.complete();
    });
  };

  var initialize = parseHash.pipe((0, _operators.mergeMap)((0, _either2.default)(function () {
    return getUserFromStorage;
  }, getUserInfo)), (0, _operators.mergeMap)(_helpers.validateUser), (0, _operators.catchError)(function (err) {
    return err.cata({
      Callback: R.compose(_rxjs.throwError, _helpers.Failures.Callback),
      SSO: function SSO() {
        return (0, _rxjs.throwError)(_helpers.Failures.SSO);
      },
      Expired: function Expired() {
        return authenticate;
      }
    });
  }), (0, _operators.mergeMap)(storeUser));

  var maintainLogin = initialize.pipe((0, _operators.mergeMap)(function (user) {
    return (0, _rxjs.empty)().pipe((0, _operators.delay)(new Date(user.expiresAt - 10000)), (0, _operators.startWith)(user));
  }), (0, _operators.repeatWhen)(function (x) {
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
    return getUserFromStorage.pipe((0, _operators.map)(api ? R.prop(api) : R.identity), (0, _operators.mergeMap)(_helpers.validateUser), (0, _operators.catchError)(function () {
      return checkSession({ audience: api }).pipe((0, _operators.map)(R.objOf(api)), (0, _operators.zip)(getUserFromStorage, R.merge), (0, _operators.mergeMap)(storeUser), (0, _operators.map)(R.prop(api)));
    }), (0, _operators.map)(R.prop("accessToken")));
  };

  return {
    initialize: initialize,
    logout: logout,
    login: login,
    maintainLogin: maintainLogin,
    getToken: getToken
  };
}