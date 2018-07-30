import { taggedSum } from "daggy";
import { Observable } from "rxjs";
import { mapTo } from "rxjs/operators";
import Either from "crocks/Either";
import isNil from "crocks/predicates/isNil";

var Left = Either.Left,
    Right = Either.Right;

export var fromNullable = function fromNullable(x) {
  return isNil(x) ? Left(x) : Right(x);
};

export var Failures = taggedSum("Failures", {
  Callback: ["error"],
  SSO: [],
  Expired: []
});

export var validateToken = function validateToken(exp) {
  return Observable.create(function (obs) {
    if (Date.now() > exp - 10000) {
      return obs.error(Failures.Expired);
    }
    obs.next(exp);
    return obs.complete();
  });
};

export var validateUser = function validateUser(user) {
  return validateToken(user.expiresAt || 0).pipe(mapTo(user));
};

export var callNext = function callNext(obj) {
  return function (val) {
    return obj.next(val);
  };
};
export var callError = function callError(obj) {
  return function (val) {
    return obj.error(val);
  };
};
export var callComplete = function callComplete(obj) {
  return function () {
    return obj.complete();
  };
};
export var callNextComplete = function callNextComplete(obj) {
  return function (val) {
    obj.next(val);
    obj.complete();
  };
};