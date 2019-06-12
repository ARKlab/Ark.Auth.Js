import { IO } from "fp-ts/lib/IO";
import { User } from "./types";
declare type StoredUser = User & {
    userVersion?: string;
};
export declare const createStorage: (key?: string) => {
    getUser: IO<import("fp-ts/lib/Option").Option<StoredUser>>;
    setUser: (value: User) => IO<void>;
    clearUser: IO<void>;
};
export {};
//# sourceMappingURL=storage.d.ts.map