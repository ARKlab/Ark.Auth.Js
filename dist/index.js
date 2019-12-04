"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth0_js_1 = require("auth0-js");
const TaskEither_1 = require("fp-ts/lib/TaskEither");
const storage_1 = require("./storage");
var storage_2 = require("./storage");
exports.createLocalStorage = storage_2.createLocalStorage;
exports.createInMemoryStorage = storage_2.createInMemoryStorage;
const IOEither_1 = require("fp-ts/lib/IOEither");
const Option_1 = require("fp-ts/lib/Option");
const Either_1 = require("fp-ts/lib/Either");
const IO_1 = require("fp-ts/lib/IO");
const idtoken_verifier_1 = __importDefault(require("idtoken-verifier"));
const Apply_1 = require("fp-ts/lib/Apply");
const function_1 = require("fp-ts/lib/function");
const seqTask = Apply_1.sequenceT(TaskEither_1.taskEither);
exports.Failures = {
    Callback: (error) => ({ type: "Callback", error }),
    SSO: (error) => ({ type: "SSO", error }),
    UserInfo: (error) => ({
        type: "UserInfo",
        error
    }),
    UserStore: () => ({ type: "UserStore" }),
    ExpiryFailure: (result) => ({
        type: "ExpiryFailure",
        result
    }),
    fold: (f, { callback, sso, userStore, expiryFailure, userInfo }) => {
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
const validateToken = (authResult) => Option_1.option
    .of(authResult)
    .map(payload => (payload.exp - 10) * 1000)
    .chain(exp => (exp > Date.now() ? Option_1.some(authResult) : Option_1.none));
const getPayload = (token) => Option_1.fromNullable(new idtoken_verifier_1.default({}).decode(token))
    .chain(x => (x instanceof Error ? Option_1.none : Option_1.some(x)))
    .map(token => token.payload)
    .getOrElse([]);
const getExpiry = (authResult) => {
    const expiryNullable = Either_1.fromNullable(exports.Failures.ExpiryFailure(authResult));
    return TaskEither_1.fromEither(expiryNullable(authResult.accessToken)
        .chain(token => expiryNullable(new idtoken_verifier_1.default({}).decode(token)))
        .chain(payload => expiryNullable(payload.exp))
        .alt(expiryNullable(authResult.expiresIn).map(exp => exp + Date.now() / 1000)));
};
function CreateAuthModule(options) {
    const auth = Auth0Facade(options);
    const storage = options.storage
        ? options.storage
        : storage_1.createLocalStorage(options.localStorageKey);
    const getUser = TaskEither_1.fromIOEither(new IOEither_1.IOEither(storage.getUser.map(Either_1.fromOptionL(exports.Failures.UserStore))));
    const storeUser = (user) => getUser
        .map(stored => (Object.assign({}, stored, user, { tokens: Object.assign({}, stored.tokens, user.tokens) })))
        .alt(TaskEither_1.taskEither.of(user))
        .chain(merged => TaskEither_1.fromIO(storage.setUser(merged).map(() => merged)));
    const userInfo = (authResult) => {
        const checkNull = Either_1.fromNullable(exports.Failures.UserInfo(authResult));
        return TaskEither_1.fromEither(checkNull(authResult.idTokenPayload));
    };
    // for userinfo endpoint
    // auth
    //   .userInfo(accessToken)
    //   .mapLeft(Failures.UserInfo)
    //   .alt(getUser);
    const logout = (returnTo) => TaskEither_1.fromIO(storage.clearUser).chain(() => auth.logout(returnTo));
    const login = () => auth.login({ responseType: "token id_token" });
    const buildUser = (authResult) => seqTask(userInfo(authResult), getExpiry(authResult)).map(([userInfo, exp]) => (Object.assign({}, userInfo, { exp, tokens: {
            ui: Object.assign({}, authResult, { accessTokenPayload: getPayload(authResult.accessToken || ""), exp })
        } })));
    const parseHash = auth
        .parseHash()
        .map(Either_1.fromNullable({ error: "No payload decoded" }))
        .chain(TaskEither_1.fromEither)
        .mapLeft(exports.Failures.Callback)
        .chain(buildUser)
        .chain(storeUser);
    const checkSession = (options = {}) => auth.checkSession(options).mapLeft(exports.Failures.SSO);
    const authenticate = getUser
        .map(user => validateToken(user.tokens.ui).map(() => user))
        .map(Either_1.fromOptionL(exports.Failures.UserStore))
        .chain(TaskEither_1.fromEither)
        .alt(checkSession({ responseType: "token id_token" }).chain(buildUser))
        .chain(storeUser);
    const getToken = ({ audience = "ui", scope = "" }) => getUser
        .map(user => user.tokens[audience])
        .map(token => Option_1.fromNullable(token)
        .chain(validateToken)
        .chain(x => Option_1.fromNullable(x.accessToken)))
        .map(Either_1.fromOptionL(exports.Failures.UserStore))
        .chain(TaskEither_1.fromEither)
        .alt(checkSession({
        audience,
        scope,
        responseType: "token"
    })
        .chain(authResult => seqTask(getUser, getExpiry(authResult)).map(([user, exp]) => (Object.assign({}, user, { tokens: Object.assign({}, user.tokens, { [audience]: Object.assign({}, authResult, { accessTokenPayload: getPayload(authResult.accessToken || ""), exp }) }) }))))
        .chain(storeUser)
        .chain(() => getToken({ audience, scope })));
    const maintainLogin = (onFail, onSuccess) => {
        let timeoutId;
        return new IO_1.IO(function Auth() {
            authenticate.run().then(auth => {
                auth.fold(onFail, onSuccess);
                auth.fold(function_1.constVoid, user => {
                    timeoutId = setTimeout(Auth, (user.tokens.ui.exp - 10) * 1000 - Date.now());
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
        maintainLogin
    };
}
exports.default = CreateAuthModule;
function Auth0Facade(options) {
    const auth = new auth0_js_1.WebAuth(Object.assign({}, options, { scope: options.scope || "openid email profile" }));
    return {
        parseHash: TaskEither_1.taskify(cb => auth.parseHash(cb)),
        checkSession: TaskEither_1.taskify((options, cb) => auth.checkSession(options, cb)),
        // userInfo: taskify<string, Auth0Error, Auth0UserProfile>((accessToken, cb) =>
        //   auth.client.userInfo(accessToken, cb)
        // ),
        logout: (returnTo) => TaskEither_1.fromIO(new IO_1.IO(() => auth.logout({ returnTo }))),
        login: (options) => TaskEither_1.fromIO(new IO_1.IO(() => auth.authorize(options)))
    };
}
//# sourceMappingURL=index.js.map