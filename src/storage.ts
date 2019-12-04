import { IO } from "fp-ts/lib/IO";
import { User } from "./types";
import { fromNullable, some, none, Option } from "fp-ts/lib/Option";

type StoredUser = User & { userVersion?: string };
const userVersion = "v1";

export type AuthStorage = {
  getUser: IO<Option<StoredUser>>;
  setUser: (value: User) => IO<void>;
  clearUser: IO<void>;
};
export const createLocalStorage = (key = "user"): AuthStorage => ({
  getUser: new IO(() =>
    fromNullable(localStorage.getItem(key))
      .map(usr => JSON.parse(usr) as StoredUser)
      .chain(user =>
        fromNullable(user.userVersion).chain(version =>
          version === userVersion ? some(user) : none
        )
      )
  ),
  setUser: (value: User) =>
    new IO(() =>
      localStorage.setItem(
        key,
        JSON.stringify({ ...value, userVersion: userVersion })
      )
    ),
  clearUser: new IO(() => localStorage.removeItem(key))
});

export const createInMemoryStorage = (): AuthStorage => {
  let user: string | undefined = undefined;

  return {
    getUser: new IO(() =>
      fromNullable(user)
        .map(usr => JSON.parse(usr) as StoredUser)
        .chain(user =>
          fromNullable(user.userVersion).chain(version =>
            version === userVersion ? some(user) : none
          )
        )
    ),
    setUser: (value: User) =>
      new IO(() => {
        user = JSON.stringify({ ...value, userVersion: userVersion });
      }),
    clearUser: new IO(() => {
      user = undefined;
    })
  };
};
