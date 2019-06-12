import { IO } from "fp-ts/lib/IO";
import { User } from "./types";
import { fromNullable, some, none } from "fp-ts/lib/Option";

type StoredUser = User & { userVersion?: string };
const userVersion = "v1";
export const createStorage = (key = "user") => ({
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
