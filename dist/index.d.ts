import { Auth0DecodedHash, Auth0ParseHashError, CheckSessionOptions, Auth0Error, AuthorizeOptions } from "auth0-js";
import * as TE from "fp-ts/lib/TaskEither";
import { AuthStorage } from "./storage";
export { createLocalStorage, createInMemoryStorage, AuthStorage, } from "./storage";
import { User } from "./types";
import "oidc-client";
import { OidcMetadata } from "oidc-client";
export declare type FailuresType = {
    type: "Callback";
    error: Auth0Error;
} | {
    type: "SSO";
    error: Auth0Error;
} | {
    type: "UserInfo";
    error: Auth0Error;
} | {
    type: "UserStore";
} | {
    type: "ExpiryFailure";
    result: Auth0DecodedHash;
};
export declare const Failures: {
    Callback: (error: Auth0Error) => FailuresType;
    SSO: (error: Auth0Error) => FailuresType;
    UserInfo: (error: Auth0Error) => FailuresType;
    UserStore: () => FailuresType;
    ExpiryFailure: (result: Auth0DecodedHash) => FailuresType;
    fold: <A>(f: FailuresType, { callback, sso, userStore, expiryFailure, userInfo, }: {
        callback: (err: Auth0Error) => A;
        sso: (error: Auth0Error) => A;
        userStore: () => A;
        expiryFailure: (error: Auth0DecodedHash) => A;
        userInfo: (error: Auth0Error) => A;
    }) => A;
};
declare type authModuleParams = {
    audience?: string;
    domain: string;
    clientID: string;
    redirectUri: string;
    localStorageKey?: string;
    scope?: string;
    storage?: AuthStorage;
};
export default function CreateAuthModule(options: authModuleParams, auth?: Idp): {
    authenticate: TE.TaskEither<FailuresType, User>;
    login: () => TE.TaskEither<Auth0ParseHashError, void>;
    logout: (returnTo: string) => TE.TaskEither<Auth0ParseHashError, void>;
    parseHash: TE.TaskEither<FailuresType, User>;
    getToken: ({ audience, scope, }: {
        audience?: string | undefined;
        scope?: string | undefined;
    }) => TE.TaskEither<FailuresType, string>;
    maintainLogin: (onFail: (f: FailuresType) => void, onSuccess: (u: User) => void) => () => () => undefined;
};
declare type IdpResponse = {
    idToken?: string;
    idTokenPayload?: any;
    accessToken: string;
    expiresIn: number;
};
declare type Idp = {
    parseHash: TE.TaskEither<{
        error: string;
    }, IdpResponse>;
    checkSession: (a: CheckSessionOptions) => TE.TaskEither<{
        error: string;
    }, IdpResponse>;
    userInfo: (accessToken: string) => TE.TaskEither<{
        error: string;
    }, any>;
    logout: (r: string) => TE.TaskEither<Auth0ParseHashError, void>;
    login: (a?: AuthorizeOptions) => TE.TaskEither<Auth0ParseHashError, void>;
};
export declare function Auth0Idp(options: authModuleParams): Idp;
declare type OidcSettings = {
    authority: string;
    client_id: string;
    redirect_uri: string;
    response_type: string;
    scope?: string;
    metadata?: Partial<OidcMetadata>;
    signingKeys?: any[];
};
export declare function OidcIdp(settings: OidcSettings): Idp;
//# sourceMappingURL=index.d.ts.map