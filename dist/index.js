"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OidcIdp = exports.Auth0Idp = exports.Failures = void 0;
const auth0_js_1 = require("auth0-js");
const TE = __importStar(require("fp-ts/lib/TaskEither"));
const storage_1 = require("./storage");
var storage_2 = require("./storage");
Object.defineProperty(exports, "createLocalStorage", { enumerable: true, get: function () { return storage_2.createLocalStorage; } });
Object.defineProperty(exports, "createInMemoryStorage", { enumerable: true, get: function () { return storage_2.createInMemoryStorage; } });
const O = __importStar(require("fp-ts/lib/Option"));
const E = __importStar(require("fp-ts/lib/Either"));
const IO = __importStar(require("fp-ts/lib/IO"));
const idtoken_verifier_1 = __importDefault(require("idtoken-verifier"));
const Apply_1 = require("fp-ts/lib/Apply");
const function_1 = require("fp-ts/lib/function");
require("oidc-client");
const oidc_client_1 = require("oidc-client");
const pipeable_1 = require("fp-ts/lib/pipeable");
const seqTask = Apply_1.sequenceT(TE.taskEither);
const seqOption = Apply_1.sequenceT(O.option);
exports.Failures = {
    Callback: (error) => ({ type: "Callback", error }),
    SSO: (error) => ({ type: "SSO", error }),
    UserInfo: (error) => ({
        type: "UserInfo",
        error,
    }),
    UserStore: () => ({ type: "UserStore" }),
    ExpiryFailure: (result) => ({
        type: "ExpiryFailure",
        result,
    }),
    fold: (f, { callback, sso, userStore, expiryFailure, userInfo, }) => {
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
const validateToken = (authResult) => pipeable_1.pipe(O.some(authResult), O.map((payload) => (payload.exp - 10) * 1000), O.chain((exp) => (exp > Date.now() ? O.some(authResult) : O.none)));
const getPayload = (token) => pipeable_1.pipe(O.fromNullable(new idtoken_verifier_1.default({}).decode(token)), O.chain((x) => (x instanceof Error ? O.none : O.some(x))), O.map((token) => token.payload), O.getOrElse(() => []));
const getExpiry = (authResult) => {
    const expiryNullable = E.fromNullable(exports.Failures.ExpiryFailure(authResult));
    return TE.fromEither(pipeable_1.pipe(expiryNullable(authResult.accessToken), E.chain((token) => expiryNullable(new idtoken_verifier_1.default({}).decode(token))), E.chain((payload) => expiryNullable(payload.exp)), E.alt(() => pipeable_1.pipe(expiryNullable(authResult.expiresIn), E.map((exp) => exp + Date.now() / 1000)))));
};
function CreateAuthModule(options, auth = Auth0Idp(options)) {
    const storage = options.storage
        ? options.storage
        : storage_1.createLocalStorage(options.localStorageKey);
    const getUser = TE.fromIOEither(pipeable_1.pipe(storage.getUser, IO.map(E.fromOption(exports.Failures.UserStore))));
    const storeUser = (user) => pipeable_1.pipe(getUser, TE.map((stored) => (Object.assign(Object.assign(Object.assign({}, stored), user), { tokens: Object.assign(Object.assign({}, stored.tokens), user.tokens) }))), TE.alt(() => TE.taskEither.of(user)), TE.chainFirst((merged) => TE.rightIO(storage.setUser(merged))));
    const userInfo = (authResult) => {
        const checkNull = E.fromNullable(exports.Failures.UserInfo(authResult));
        return TE.fromEither(checkNull(authResult.idTokenPayload));
    };
    // for userinfo endpoint
    // auth
    //   .userInfo(accessToken)
    //   .mapLeft(Failures.UserInfo)
    //   .alt(getUser);
    const logout = (returnTo) => pipeable_1.pipe(TE.rightIO(storage.clearUser), TE.chain(() => auth.logout(returnTo)));
    const login = () => auth.login({ responseType: "token id_token" });
    const buildUser = (authResult) => pipeable_1.pipe(seqTask(userInfo(authResult), getExpiry(authResult)), TE.map(([userInfo, exp]) => (Object.assign(Object.assign({}, userInfo), { exp, tokens: {
            ui: Object.assign(Object.assign({}, authResult), { accessTokenPayload: getPayload(authResult.accessToken || ""), exp }),
        } }))));
    const parseHash = pipeable_1.pipe(auth.parseHash, TE.mapLeft(exports.Failures.Callback), TE.chain(buildUser), TE.chain(storeUser));
    const checkSession = (options = {}) => pipeable_1.pipe(auth.checkSession(options), TE.mapLeft(exports.Failures.SSO));
    const authenticate = pipeable_1.pipe(getUser, TE.chain((user) => pipeable_1.pipe(validateToken(user.tokens.ui), O.map(() => user), TE.fromOption(exports.Failures.UserStore))), TE.alt(() => pipeable_1.pipe(checkSession({ responseType: "token id_token" }), TE.chain(buildUser), TE.chain(storeUser))));
    const getToken = ({ audience = "ui", scope = "", }) => pipeable_1.pipe(getUser, TE.map((user) => user.tokens[audience]), TE.map((token) => pipeable_1.pipe(O.fromNullable(token), O.chain(validateToken), O.chain((x) => O.fromNullable(x.accessToken)))), TE.chain(TE.fromOption(exports.Failures.UserStore)), TE.alt(() => pipeable_1.pipe(checkSession(Object.assign(Object.assign(Object.assign({}, (audience === "ui" ? {} : { audience })), (scope === "" ? {} : { scope })), { responseType: "token" })), TE.chain((authResult) => pipeable_1.pipe(seqTask(getUser, getExpiry(authResult)), TE.map(([user, exp]) => (Object.assign(Object.assign({}, user), { tokens: Object.assign(Object.assign({}, user.tokens), { [audience]: Object.assign(Object.assign({}, authResult), { accessTokenPayload: getPayload(authResult.accessToken || ""), exp }) }) }))), TE.chain(storeUser))), TE.chain(() => getToken({ audience, scope })))));
    const maintainLogin = (onFail, onSuccess) => {
        let timeoutId;
        return function Auth() {
            authenticate().then((auth) => {
                E.fold(onFail, onSuccess)(auth);
                pipeable_1.pipe(auth, E.fold(function_1.constVoid, (user) => {
                    timeoutId = setTimeout(Auth, (user.tokens.ui.exp - 10) * 1000 - Date.now());
                }));
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
exports.default = CreateAuthModule;
function Auth0Idp(options) {
    const auth = new auth0_js_1.WebAuth(Object.assign(Object.assign({}, options), { scope: options.scope || "openid email profile" }));
    const parseHash = TE.taskify((cb) => auth.parseHash(cb));
    return {
        parseHash: pipeable_1.pipe(parseHash(), TE.map(E.fromNullable({ error: "No Payload Decoded" })), TE.chain(TE.fromEither), TE.chain((res) => pipeable_1.pipe(seqOption(O.fromNullable(res.accessToken), O.fromNullable(res.expiresIn)), TE.fromOption(() => ({ error: "Payload has missing fields" })), TE.map(([token, exp]) => (Object.assign(Object.assign({}, res), { accessToken: token, expiresIn: exp })))))),
        checkSession: TE.taskify((options, cb) => auth.checkSession(options, cb)),
        logout: (returnTo) => TE.rightIO(() => auth.logout({ returnTo })),
        login: (options) => TE.rightIO(() => auth.authorize(options)),
    };
}
exports.Auth0Idp = Auth0Idp;
function OidcIdp(settings) {
    const oidc = new oidc_client_1.UserManager(settings);
    oidc.signinSilentCallback();
    return {
        parseHash: TE.tryCatch(() => oidc.signinCallback().then((res) => {
            var _a;
            const payload = getPayload(res.id_token || res.access_token);
            return {
                idToken: res.id_token,
                idTokenPayload: payload,
                accessToken: res.access_token,
                expiresIn: (_a = res.expires_in) !== null && _a !== void 0 ? _a : payload.exp - Date.now() / 1000,
            };
        }), (e) => ({
            error: "Parse Hash error",
            errorDescription: e,
        })),
        checkSession: (settings) => TE.tryCatch(() => oidc
            .signinSilent({
            resource: settings.audience,
            scope: settings.scope,
            extraQueryParams: settings.audience
                ? { audience: settings.audience }
                : {},
        })
            .then((res) => {
            var _a, _b;
            const payload = getPayload(res.id_token || res.access_token);
            return {
                idToken: res.id_token,
                idTokenPayload: payload,
                accessToken: (_a = res.access_token) !== null && _a !== void 0 ? _a : res.id_token,
                expiresIn: (_b = res.expires_in) !== null && _b !== void 0 ? _b : payload.exp - Date.now() / 1000,
            };
        }), (e) => ({
            error: "Silent Refresh Fail",
            errorDescription: e,
        })),
        login: () => TE.tryCatch(() => oidc.signinRedirect(), () => ({ error: "login failure" })),
        logout: () => TE.tryCatch(() => oidc.signoutRedirect(), () => ({ error: "logout failure" })),
    };
}
exports.OidcIdp = OidcIdp;
//# sourceMappingURL=index.js.map