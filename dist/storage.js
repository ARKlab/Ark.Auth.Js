"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const IO_1 = require("fp-ts/lib/IO");
const Option_1 = require("fp-ts/lib/Option");
const userVersion = "v1";
exports.createLocalStorage = (key = "user") => ({
    getUser: new IO_1.IO(() => Option_1.fromNullable(localStorage.getItem(key))
        .map(usr => JSON.parse(usr))
        .chain(user => Option_1.fromNullable(user.userVersion).chain(version => version === userVersion ? Option_1.some(user) : Option_1.none))),
    setUser: (value) => new IO_1.IO(() => localStorage.setItem(key, JSON.stringify(Object.assign({}, value, { userVersion: userVersion })))),
    clearUser: new IO_1.IO(() => localStorage.removeItem(key))
});
exports.createInMemoryStorage = () => {
    let user = undefined;
    return {
        getUser: new IO_1.IO(() => Option_1.fromNullable(user)
            .map(usr => JSON.parse(usr))
            .chain(user => Option_1.fromNullable(user.userVersion).chain(version => version === userVersion ? Option_1.some(user) : Option_1.none))),
        setUser: (value) => new IO_1.IO(() => {
            user = JSON.stringify(Object.assign({}, value, { userVersion: userVersion }));
        }),
        clearUser: new IO_1.IO(() => {
            user = undefined;
        })
    };
};
//# sourceMappingURL=storage.js.map