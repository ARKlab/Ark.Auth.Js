import { Auth0DecodedHash, Auth0Error } from "auth0-js";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { User } from "./types";
import { IO } from "fp-ts/lib/IO";
export declare type FailuresType = {
    type: "Callback";
    error: Auth0Error;
} | {
    type: "SSO";
    error: Auth0Error;
} | {
    type: "UserInfo";
    error: Auth0DecodedHash;
} | {
    type: "UserStore";
} | {
    type: "ExpiryFailure";
    result: Auth0DecodedHash;
};
export declare const Failures: {
    Callback: (error: Auth0Error) => FailuresType;
    SSO: (error: Auth0Error) => FailuresType;
    UserInfo: (error: Auth0DecodedHash) => FailuresType;
    UserStore: () => FailuresType;
    ExpiryFailure: (result: Auth0DecodedHash) => FailuresType;
    fold: <A>(f: FailuresType, { callback, sso, userStore, expiryFailure, userInfo }: {
        callback: (err: Auth0Error) => A;
        sso: (error: Auth0Error) => A;
        userStore: () => A;
        expiryFailure: (error: Auth0DecodedHash) => A;
        userInfo: (error: Auth0DecodedHash) => A;
    }) => A;
};
declare type authModuleParams = {
    audience?: string;
    domain: string;
    clientID: string;
    redirectUri: string;
    localStorageKey?: string;
    scope?: string;
};
export default function CreateAuthModule(options: authModuleParams): {
    authenticate: TaskEither<FailuresType, User>;
    login: () => TaskEither<{}, void>;
    logout: (returnTo: string) => TaskEither<{}, void>;
    parseHash: TaskEither<FailuresType, User>;
    getToken: ({ audience, scope }: {
        audience?: string | undefined;
        scope?: string | undefined;
    }) => TaskEither<FailuresType, string>;
    maintainLogin: (onFail: (f: FailuresType) => void, onSuccess: (u: User) => void) => IO<() => undefined>;
};
export {};
//# sourceMappingURL=index.d.ts.map