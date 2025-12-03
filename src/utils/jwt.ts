import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type JwtRole = 'client'|'merchant'|'courier'|'admin';

export function signAccessToken(sub: number, role: JwtRole, name?: string) {
  return jwt.sign({ role, name }, env.jwtSecret, { subject: String(sub), expiresIn: env.jwtExpiresIn as any });
}

export function signRefreshToken(sub: number, role: JwtRole) {
  return jwt.sign({ role, typ: 'refresh' }, env.refreshJwtSecret, { subject: String(sub), expiresIn: env.refreshExpiresIn as any });
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.refreshJwtSecret) as { sub: string; role: JwtRole };
}
