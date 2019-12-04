import { IO } from "fp-ts/lib/IO";
import { User } from "./types";
import { Option } from "fp-ts/lib/Option";
declare type StoredUser = User & {
    userVersion?: string;
};
export declare type AuthStorage = {
    getUser: IO<Option<StoredUser>>;
    setUser: (value: User) => IO<void>;
    clearUser: IO<void>;
};
export declare const createLocalStorage: (key?: string) => AuthStorage;
export declare const createInMemoryStorage: () => AuthStorage;
export {};
//# sourceMappingURL=storage.d.ts.map