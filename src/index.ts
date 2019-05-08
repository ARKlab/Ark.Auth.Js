import {
  WebAuth,
  Auth0DecodedHash,
  Auth0ParseHashError,
  CheckSessionOptions,
  Auth0UserProfile,
  Auth0Error,
  AuthorizeOptions
} from "auth0-js";
import {
  taskify,
  TaskEither,
  fromIOEither,
  fromEither,
  fromIO,
  taskEither
} from "fp-ts/lib/TaskEither";
import { createStorage } from "./storage";
import { User } from "./types";
import { IOEither } from "fp-ts/lib/IOEither";
import {
  fromNullable as fromNullableOption,
  some,
  none,
  option
} from "fp-ts/lib/Option";
import { fromNullable, fromOptionL } from "fp-ts/lib/Either";
import { IO } from "fp-ts/lib/IO";
import IdTokenVerifier from "idtoken-verifier";
import { sequenceT } from "fp-ts/lib/Apply";
import { constVoid } from "fp-ts/lib/function";

const seqTask = sequenceT(taskEither);

type Failures =
  | { type: "Callback"; error: Auth0Error }
  | { type: "SSO"; error: Auth0Error }
  | { type: "UserInfo"; error: Auth0DecodedHash }
  | { type: "UserStore" }
  | { type: "ExpiryFailure"; result: Auth0DecodedHash };

const Failures = {
  Callback: (error: Auth0Error): Failures => ({ type: "Callback", error }),
  SSO: (error: Auth0Error): Failures => ({ type: "SSO", error }),
  UserInfo: (error: Auth0DecodedHash): Failures => ({
    type: "UserInfo",
    error
  }),
  UserStore: (): Failures => ({ type: "UserStore" }),
  ExpiryFailure: (result: Auth0DecodedHash): Failures => ({
    type: "ExpiryFailure",
    result
  }),
  fold: <A>(
    callback: (err: Auth0Error) => A,
    sso: (error: Auth0Error) => A,
    userStore: () => A,
    expiryFailure: (error: Auth0DecodedHash) => A,
    userInfo: (error: Auth0DecodedHash) => A
  ) => (f: Failures): A => {
    switch (f.type) {
      case "Callback":
        return callback(f.error);
      case "SSO":
        return sso(f.error);
      case "UserInfo":
        return userInfo(f.error);
      case "UserStore":
        return userStore();
      case "UserStore":
        return userStore();
      case "ExpiryFailure":
        return expiryFailure(f.result);
    }
  }
};

type authModuleParams = {
  audience?: string;
  domain: string;
  clientID: string;
  redirectUri: string;
  localStorageKey?: string;
};

const validateToken = <A>(authResult: A & { exp: number }) =>
  option
    .of(authResult)
    .map(payload => (payload.exp - 10) * 1000)
    .chain(exp => (exp > Date.now() ? some(authResult) : none));

const getPermissions = (accessToken: string): string[] =>
  fromNullableOption(new IdTokenVerifier({}).decode(accessToken))
    .map(token => token.payload)
    .chain(payload => fromNullableOption(payload.permissions))
    .getOrElse([]);

const getExpiry = (
  authResult: Auth0DecodedHash
): TaskEither<Failures, number> => {
  const expiryNullable = fromNullable(Failures.ExpiryFailure(authResult));

  return fromEither(
    expiryNullable(authResult.accessToken)
      .chain(token => expiryNullable(new IdTokenVerifier({}).decode(token)))
      .chain(payload => expiryNullable(payload.exp))
      .alt(
        expiryNullable(authResult.expiresIn).map(exp => exp + Date.now() / 1000)
      )
  );
};

export default function CreateAuthModule(options: authModuleParams) {
  const auth = Auth0Facade(options);
  const storage = createStorage(options.localStorageKey);

  const getUser = fromIOEither(
    new IOEither(storage.getUser.map(fromOptionL(Failures.UserStore)))
  );

  const storeUser = (user: User): TaskEither<Failures, User> =>
    getUser
      .map(stored => ({
        ...stored,
        ...user,
        tokens: { ...stored.tokens, ...user.tokens }
      }))
      .alt(taskEither.of(user))
      .chain(merged => fromIO(storage.setUser(merged).map(() => merged)));

  const userInfo = (
    authResult: Auth0DecodedHash
  ): TaskEither<Failures, Auth0UserProfile> => {
    const checkNull = fromNullable(Failures.UserInfo(authResult));

    return fromEither(checkNull(authResult.idTokenPayload));
  };

  // for userinfo endpoint
  // auth
  //   .userInfo(accessToken)
  //   .mapLeft(Failures.UserInfo)
  //   .alt(getUser);

  const logout = (returnTo: string) =>
    fromIO(storage.clearUser).chain(() => auth.logout(returnTo));

  const login = auth.login;

  const buildUser = (authResult: Auth0DecodedHash) =>
    seqTask(userInfo(authResult), getExpiry(authResult)).map(
      ([userInfo, exp]) => ({
        ...userInfo,
        exp,
        permissions: getPermissions(authResult.accessToken || ""),
        tokens: {
          ui: {
            ...authResult,
            exp,
            permissions: getPermissions(authResult.accessToken || "")
          }
        }
      })
    );
  const parseHash: TaskEither<Failures, User> = auth
    .parseHash()
    .map(fromNullable({ error: "No payload decoded" }))
    .chain(fromEither)
    .mapLeft(Failures.Callback)
    .chain(buildUser)
    .chain(storeUser);

  const checkSession = (options: CheckSessionOptions = {}) =>
    auth.checkSession(options).mapLeft(Failures.SSO);

  const authenticate: TaskEither<Failures, User> = getUser
    .map(user => validateToken(user.tokens.ui).map(() => user))
    .map(fromOptionL(Failures.UserStore))
    .chain(fromEither)
    .alt(checkSession().chain(buildUser))
    .chain(storeUser);

  const getToken = (api = "ui"): TaskEither<Failures, string> =>
    getUser
      .map(user => user.tokens[api])
      .map(token =>
        fromNullableOption(token)
          .chain(validateToken)
          .chain(x => fromNullableOption(x.accessToken))
      )
      .map(fromOptionL(Failures.UserStore))
      .chain(fromEither)
      .alt(
        checkSession({ audience: api })
          .chain(authResult =>
            seqTask(getUser, getExpiry(authResult)).map(([user, exp]) => ({
              ...user,
              tokens: {
                ...user.tokens,
                [api]: {
                  ...authResult,
                  exp,
                  permissions: getPermissions(authResult.accessToken || "")
                }
              }
            }))
          )
          .chain(storeUser)
          .chain(() => getToken(api))
      );

  const maintainLogin = (
    onFail: (f: Failures) => void,
    onSuccess: (u: User) => void
  ) => {
    let timeoutId: number;
    return new IO(function Auth() {
      authenticate.run().then(auth => {
        auth.fold(onFail, onSuccess);

        auth.fold(constVoid, user => {
          timeoutId = setTimeout(
            Auth,
            (user.tokens.ui.exp - 10) * 1000 - Date.now()
          );
        });
      });
      return () => (timeoutId && clearTimeout(timeoutId)) || undefined;
    });
  };

  return {
    authenticate,
    login,
    logout,
    parseHash,
    getToken,
    maintainLogin,
    getPermissions
  };
}

function Auth0Facade(options: authModuleParams) {
  const auth = new WebAuth({
    ...options,
    scope: "openid email profile",
    responseType: "token id_token"
  });
  return {
    parseHash: taskify<Auth0ParseHashError, Auth0DecodedHash | null>(cb =>
      auth.parseHash(cb)
    ),
    checkSession: taskify<CheckSessionOptions, Auth0Error, Auth0DecodedHash>(
      (options, cb) => auth.checkSession(options, cb)
    ),
    // userInfo: taskify<string, Auth0Error, Auth0UserProfile>((accessToken, cb) =>
    //   auth.client.userInfo(accessToken, cb)
    // ),
    logout: (returnTo: string) =>
      fromIO(new IO(() => auth.logout({ returnTo }))),

    login: (options?: AuthorizeOptions) =>
      fromIO(new IO(() => auth.authorize(options)))
  };
}
