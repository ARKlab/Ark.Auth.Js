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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryStorage = exports.createLocalStorage = void 0;
const Option_1 = require("fp-ts/lib/Option");
const O = __importStar(require("fp-ts/lib/Option"));
const pipeable_1 = require("fp-ts/lib/pipeable");
const userVersion = "v1";
exports.createLocalStorage = (key = "user") => ({
    getUser: () => pipeable_1.pipe(Option_1.fromNullable(localStorage.getItem(key)), O.map((usr) => JSON.parse(usr)), O.chain((user) => pipeable_1.pipe(Option_1.fromNullable(user.userVersion), O.chain((version) => (version === userVersion ? Option_1.some(user) : Option_1.none))))),
    setUser: (value) => () => localStorage.setItem(key, JSON.stringify(Object.assign(Object.assign({}, value), { userVersion: userVersion }))),
    clearUser: () => localStorage.removeItem(key),
});
exports.createInMemoryStorage = () => {
    let user = undefined;
    return {
        getUser: () => pipeable_1.pipe(Option_1.fromNullable(user), O.map((usr) => JSON.parse(usr)), O.chain((user) => pipeable_1.pipe(Option_1.fromNullable(user.userVersion), O.chain((version) => (version === userVersion ? Option_1.some(user) : Option_1.none))))),
        setUser: (value) => () => {
            user = JSON.stringify(Object.assign(Object.assign({}, value), { userVersion: userVersion }));
        },
        clearUser: () => {
            user = undefined;
        },
    };
};
//# sourceMappingURL=storage.js.map