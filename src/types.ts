import { Auth0UserProfile, Auth0DecodedHash } from "auth0-js";

export type User = Auth0UserProfile & {
  tokens: Record<string, Auth0DecodedHash & { exp: number }>;
};
