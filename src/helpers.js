import { taggedSum } from "daggy";
import { Observable } from "rxjs";
import { mapTo } from "rxjs/operators";
import Either from "crocks/Either";
import isNil from "crocks/predicates/isNil";
import * as R from "ramda";

const { Left, Right } = Either;
export const fromNullable = x => isNil(x) ? Left(x) : Right(x);

export const Failures = taggedSum("Failures", {
  Callback: ["error"],
  SSO: [],
  Expired: []
});

export const validateToken = exp =>
  Observable.create(obs => {
    if (Date.now() > exp - 10000) {
      return obs.error(Failures.Expired);
    }
    obs.next(exp);
    return obs.complete();
  });

export const calcExipryTime = user =>
  R.merge(user, {
    expiresAt: Date.now() + user.expiresIn * 1000
  });
export const validateUser = user =>
  validateToken(user.expiresAt || 0).pipe(mapTo(user));

export const callNext = obj => val => obj.next(val);
export const callError = obj => val => obj.error(val);
export const callComplete = obj => () => obj.complete();
export const callNextComplete = obj => val => {
  obj.next(val);
  obj.complete();
};
