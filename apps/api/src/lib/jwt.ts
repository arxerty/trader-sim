import { jwtVerify, SignJWT, errors } from 'jose';
import { unauthorized } from './errors';

export interface AccessClaims {
  sub: string;
  nick: string;
}

const ISSUER = 'trader-sim-api';
const AUDIENCE = 'trader-sim-web';

export class JwtService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(claims: AccessClaims): Promise<string> {
    return new SignJWT({ nick: claims.nick })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.nick !== 'string')
        throw unauthorized('TOKEN_INVALID');
      return { sub: payload.sub, nick: payload.nick };
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw unauthorized('TOKEN_EXPIRED');
      throw unauthorized('TOKEN_INVALID');
    }
  }
}
