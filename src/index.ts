import {
  WebAuth,
  Auth0DecodedHash,
  Auth0ParseHashError,
  CheckSessionOptions,
  Auth0UserProfile,
  Auth0Error,
  AuthorizeOptions,
} from "auth0-js";
import * as TE from "fp-ts/lib/TaskEither";
import { createLocalStorage, AuthStorage } from "./storage";
export {
  createLocalStorage,
  createInMemoryStorage,
  AuthStorage,
} from "./storage";
import { User } from "./types";
import * as O from "fp-ts/lib/Option";
import * as E from "fp-ts/lib/Either";
import * as IO from "fp-ts/lib/IO";
import IdTokenVerifier from "idtoken-verifier";
import { sequenceT } from "fp-ts/lib/Apply";
import { constVoid } from "fp-ts/lib/function";
import "oidc-client";
import { UserManager, OidcMetadata } from "oidc-client";
import { pipe } from "fp-ts/lib/pipeable";

const seqTask = sequenceT(TE.taskEither);
const seqOption = sequenceT(O.option);

export type FailuresType =
  | { type: "Callback"; error: Auth0Error }
  | { type: "SSO"; error: Auth0Error }
  | { type: "UserInfo"; error: Auth0DecodedHash }
  | { type: "UserStore" }
  | { type: "ExpiryFailure"; result: Auth0DecodedHash };

export const Failures = {
  Callback: (error: Auth0Error): FailuresType => ({ type: "Callback", error }),
  SSO: (error: Auth0Error): FailuresType => ({ type: "SSO", error }),
  UserInfo: (error: Auth0DecodedHash): FailuresType => ({
    type: "UserInfo",
    error,
  }),
  UserStore: (): FailuresType => ({ type: "UserStore" }),
  ExpiryFailure: (result: Auth0DecodedHash): FailuresType => ({
    type: "ExpiryFailure",
    result,
  }),
  fold: <A>(
    f: FailuresType,
    {
      callback,
      sso,
      userStore,
      expiryFailure,
      userInfo,
    }: {
      callback: (err: Auth0Error) => A;
      sso: (error: Auth0Error) => A;
      userStore: () => A;
      expiryFailure: (error: Auth0DecodedHash) => A;
      userInfo: (error: Auth0DecodedHash) => A;
    }
  ): A => {
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
  },
};

type authModuleParams = {
  audience?: string;
  domain: string;
  clientID: string;
  redirectUri: string;
  localStorageKey?: string;
  scope?: string;
  storage?: AuthStorage;
};

const validateToken = <A>(authResult: A & { exp: number }) =>
  pipe(
    O.some(authResult),
    O.map((payload) => (payload.exp - 10) * 1000),
    O.chain((exp) => (exp > Date.now() ? O.some(authResult) : O.none))
  );

const getPayload = (token: string): any =>
  pipe(
    O.fromNullable(new IdTokenVerifier({}).decode(token)),
    O.chain((x) => (x instanceof Error ? O.none : O.some(x))),
    O.map((token) => token.payload),
    O.getOrElse(() => [] as any)
  );

const getExpiry = (
  authResult: IdpResponse
): TE.TaskEither<FailuresType, number> => {
  const expiryNullable = E.fromNullable(Failures.ExpiryFailure(authResult));

  return TE.fromEither(
    pipe(
      expiryNullable(authResult.accessToken),
      E.chain((token) => expiryNullable(new IdTokenVerifier({}).decode(token))),
      E.chain((payload) => expiryNullable(payload.exp)),
      E.alt(() =>
        pipe(
          expiryNullable(authResult.expiresIn),
          E.map((exp) => exp + Date.now() / 1000)
        )
      )
    )
  );
};

export default function CreateAuthModule(
  options: authModuleParams,
  auth = Auth0Idp(options)
) {
  const storage = options.storage
    ? options.storage
    : createLocalStorage(options.localStorageKey);

  const getUser = TE.fromIOEither(
    pipe(storage.getUser, IO.map(E.fromOption(Failures.UserStore)))
  );

  const storeUser = (user: User): TE.TaskEither<FailuresType, User> =>
    pipe(
      getUser,
      TE.map((stored) => ({
        ...stored,
        ...user,
        tokens: { ...stored.tokens, ...user.tokens },
      })),
      TE.alt(() => TE.taskEither.of(user)),
      TE.chainFirst((merged) => TE.rightIO(storage.setUser(merged)))
    );

  const userInfo = (
    authResult: Auth0DecodedHash
  ): TE.TaskEither<FailuresType, Auth0UserProfile> => {
    const checkNull = E.fromNullable(Failures.UserInfo(authResult));

    return TE.fromEither(checkNull(authResult.idTokenPayload));
  };

  // for userinfo endpoint
  // auth
  //   .userInfo(accessToken)
  //   .mapLeft(Failures.UserInfo)
  //   .alt(getUser);

  const logout = (returnTo: string) =>
    pipe(
      TE.rightIO(storage.clearUser),
      TE.chain(() => auth.logout(returnTo))
    );

  const login = () => auth.login({ responseType: "token id_token" });

  const buildUser = (authResult: IdpResponse) =>
    pipe(
      seqTask(userInfo(authResult), getExpiry(authResult)),
      TE.map(([userInfo, exp]) => ({
        ...userInfo,
        exp,
        tokens: {
          ui: {
            ...authResult,
            accessTokenPayload: getPayload(authResult.accessToken || ""),
            exp,
          },
        },
      }))
    );
  const parseHash: TE.TaskEither<FailuresType, User> = pipe(
    auth.parseHash,
    TE.mapLeft(Failures.Callback),
    TE.chain(buildUser),
    TE.chain(storeUser)
  );

  const checkSession = (options: checkSessionParams = {}) =>
    pipe(auth.checkSession(options), TE.mapLeft(Failures.SSO));

  const authenticate: TE.TaskEither<FailuresType, User> = pipe(
    getUser,
    TE.chain((user) =>
      pipe(
        validateToken(user.tokens.ui),
        O.map(() => user),
        TE.fromOption(Failures.UserStore)
      )
    ),
    TE.alt(() =>
      pipe(
        checkSession({ responseType: "token id_token" }),
        TE.chain(buildUser),
        TE.chain(storeUser)
      )
    )
  );

  const getToken = ({
    audience = "ui",
    scope = "",
  }): TE.TaskEither<FailuresType, string> =>
    pipe(
      getUser,
      TE.map((user) => user.tokens[audience]),
      TE.map((token) =>
        pipe(
          O.fromNullable(token),
          O.chain(validateToken),
          O.chain((x) => O.fromNullable(x.accessToken))
        )
      ),
      TE.chain(TE.fromOption(Failures.UserStore)),
      TE.alt(() =>
        pipe(
          checkSession({
            ...(audience === "ui" ? {} : { audience }),
            ...(scope === "" ? {} : { scope }),
            responseType: "token",
          }),
          TE.chain((authResult) =>
            pipe(
              seqTask(getUser, getExpiry(authResult)),
              TE.map(([user, exp]) => ({
                ...user,
                tokens: {
                  ...user.tokens,
                  [audience]: {
                    ...authResult,
                    accessTokenPayload: getPayload(
                      authResult.accessToken || ""
                    ),
                    exp,
                  },
                },
              })),
              TE.chain(storeUser)
            )
          ),
          TE.chain(() => getToken({ audience, scope }))
        )
      )
    );

  const maintainLogin = (
    onFail: (f: FailuresType) => void,
    onSuccess: (u: User) => void
  ) => {
    let timeoutId: number;
    return function Auth() {
      authenticate().then((auth) => {
        E.fold(onFail, onSuccess)(auth);

        pipe(
          auth,
          E.fold(constVoid, (user) => {
            timeoutId = setTimeout(
              Auth,
              (user.tokens.ui.exp - 10) * 1000 - Date.now()
            );
          })
        );
      });
      return () => (timeoutId && clearTimeout(timeoutId)) || undefined;
    };
  };

  return {
    authenticate,
    login,
    logout,
    parseHash,
    getToken,
    maintainLogin,
  };
}

type checkSessionParams = {
  audience?: string;
  scope?: string;
  responseType?: string;
};

type IdpResponse = {
  idToken?: string;
  idTokenPayload?: any;
  accessToken: string;
  expiresIn: number;
};
type Idp = {
  parseHash: TE.TaskEither<{ error: string }, IdpResponse>;
  checkSession: (
    a: CheckSessionOptions
  ) => TE.TaskEither<{ error: string }, IdpResponse>;
  logout: (r: string) => TE.TaskEither<Auth0ParseHashError, void>;
  login: (a?: AuthorizeOptions) => TE.TaskEither<Auth0ParseHashError, void>;
};

export function Auth0Idp(options: authModuleParams): Idp {
  const auth = new WebAuth({
    ...options,
    scope: options.scope || "openid email profile",
  });
  const parseHash = TE.taskify<Auth0ParseHashError, Auth0DecodedHash | null>(
    (cb) => auth.parseHash(cb)
  );
  return {
    parseHash: pipe(
      parseHash(),
      TE.map(E.fromNullable({ error: "No Payload Decoded" })),
      TE.chain(TE.fromEither),
      TE.chain((res) =>
        pipe(
          seqOption(
            O.fromNullable(res.accessToken),
            O.fromNullable(res.expiresIn)
          ),
          TE.fromOption(() => ({ error: "Payload has missing fields" })),
          TE.map(([token, exp]) => ({
            ...res,
            accessToken: token,
            expiresIn: exp,
          }))
        )
      )
    ),
    checkSession: TE.taskify<CheckSessionOptions, Auth0Error, IdpResponse>(
      (options, cb) => auth.checkSession(options, cb)
    ),
    logout: (returnTo: string) => TE.rightIO(() => auth.logout({ returnTo })),

    login: (options?: AuthorizeOptions) =>
      TE.rightIO(() => auth.authorize(options)),
  };
}
type OidcSettings = {
  authority: string;
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope?: string;
  metadata?: Partial<OidcMetadata>;
  signingKeys?: any[];
};
export function OidcIdp(settings: OidcSettings): Idp {
  const oidc = new UserManager(settings);

  oidc.signinSilentCallback();

  return {
    parseHash: TE.tryCatch(
      () =>
        oidc.signinCallback().then((res) => {
          const payload = getPayload(res.id_token || res.access_token);
          return {
            idToken: res.id_token,
            idTokenPayload: payload,
            accessToken: res.access_token,
            expiresIn: res.expires_in ?? payload.exp - Date.now() / 1000,
          };
        }),
      (e) => ({
        error: "Parse Hash error",
        errorDescription: e,
      })
    ),
    checkSession: (settings: checkSessionParams) =>
      TE.tryCatch(
        () =>
          oidc
            .signinSilent({
              resource: settings.audience,
              scope: settings.scope,
              extraQueryParams: settings.audience
                ? { audience: settings.audience }
                : {},
            })
            .then((res) => {
              const payload = getPayload(res.id_token || res.access_token);
              return {
                idToken: res.id_token,
                idTokenPayload: payload,
                accessToken: res.access_token ?? res.id_token,
                expiresIn: res.expires_in ?? payload.exp - Date.now() / 1000,
              };
            }),
        (e) => ({
          error: "Silent Refresh Fail",
          errorDescription: e,
        })
      ),
    login: () =>
      TE.tryCatch(
        () => oidc.signinRedirect(),
        () => ({ error: "login failure" })
      ),
    logout: () =>
      TE.tryCatch(
        () => oidc.signoutRedirect(),
        () => ({ error: "logout failure" })
      ),
  };
}
