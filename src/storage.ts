import { IO } from "fp-ts/lib/IO";
import { User } from "./types";
import { fromNullable, some, none, Option } from "fp-ts/lib/Option";
import * as O from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/pipeable";

type StoredUser = User & { userVersion?: string };
const userVersion = "v1";

export type AuthStorage = {
  getUser: IO<Option<StoredUser>>;
  setUser: (value: User) => IO<void>;
  clearUser: IO<void>;
};
export const createLocalStorage = (key = "user"): AuthStorage => ({
  getUser: () =>
    pipe(
      fromNullable(localStorage.getItem(key)),
      O.map((usr) => JSON.parse(usr) as StoredUser),
      O.chain((user) =>
        pipe(
          fromNullable(user.userVersion),
          O.chain((version) => (version === userVersion ? some(user) : none))
        )
      )
    ),

  setUser: (value: User) => () =>
    localStorage.setItem(
      key,
      JSON.stringify({ ...value, userVersion: userVersion })
    ),
  clearUser: () => localStorage.removeItem(key),
});

export const createInMemoryStorage = (): AuthStorage => {
  let user: string | undefined = undefined;

  return {
    getUser: () =>
      pipe(
        fromNullable(user),
        O.map((usr) => JSON.parse(usr) as StoredUser),
        O.chain((user) =>
          pipe(
            fromNullable(user.userVersion),
            O.chain((version) => (version === userVersion ? some(user) : none))
          )
        )
      ),
    setUser: (value: User) => () => {
      user = JSON.stringify({ ...value, userVersion: userVersion });
    },
    clearUser: () => {
      user = undefined;
    },
  };
};
