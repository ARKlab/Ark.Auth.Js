"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.callNextComplete = exports.callComplete = exports.callError = exports.callNext = exports.validateUser = exports.validateToken = exports.Failures = exports.fromNullable = undefined;

var _daggy = require("daggy");

var _rxjs = require("rxjs");

var _operators = require("rxjs/operators");

var _Either = require("crocks/Either");

var _Either2 = _interopRequireDefault(_Either);

var _isNil = require("crocks/predicates/isNil");

var _isNil2 = _interopRequireDefault(_isNil);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Left = _Either2.default.Left,
    Right = _Either2.default.Right;
var fromNullable = exports.fromNullable = function fromNullable(x) {
  return (0, _isNil2.default)(x) ? Left(x) : Right(x);
};

var Failures = exports.Failures = (0, _daggy.taggedSum)("Failures", {
  Callback: ["error"],
  SSO: [],
  Expired: []
});

var validateToken = exports.validateToken = function validateToken(exp) {
  return _rxjs.Observable.create(function (obs) {
    if (Date.now() > exp - 10000) {
      return obs.error(Failures.Expired);
    }
    obs.next(exp);
    return obs.complete();
  });
};

var validateUser = exports.validateUser = function validateUser(user) {
  return validateToken(user.expiresAt || 0).pipe((0, _operators.mapTo)(user));
};

var callNext = exports.callNext = function callNext(obj) {
  return function (val) {
    return obj.next(val);
  };
};
var callError = exports.callError = function callError(obj) {
  return function (val) {
    return obj.error(val);
  };
};
var callComplete = exports.callComplete = function callComplete(obj) {
  return function () {
    return obj.complete();
  };
};
var callNextComplete = exports.callNextComplete = function callNextComplete(obj) {
  return function (val) {
    obj.next(val);
    obj.complete();
  };
};