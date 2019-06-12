export = index;
declare class index {
  constructor(parameters: any);
  jwksCache: any;
  expectedAlg: any;
  issuer: any;
  audience: any;
  leeway: any;
  jwksURI: any;
  decode(token: string): any;
  getRsaVerifier(iss: any, kid: any, cb: any): void;
  validateAccessToken(accessToken: any, alg: any, atHash: any, cb: any): any;
  verify(token: any, nonce: any, cb: any): any;
  verifyExpAndIat(exp: any, iat: any): any;
  verifyExpAndNbf(exp: any, nbf: any): any;
}
