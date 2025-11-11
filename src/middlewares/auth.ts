import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload as JwtStdPayload } from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload extends JwtStdPayload {
  role: 'client' | 'merchant' | 'courier' | 'admin';
  name?: string;
}

function isJwtPayload(obj: JwtStdPayload): obj is JwtPayload {
  return typeof (obj as any).role === 'string';
}

export function authOptional(req: Request, _res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  if (!hdr || !hdr.startsWith('Bearer ')) return next();
  const token = hdr.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded !== 'string' && isJwtPayload(decoded)) {
      if (typeof decoded.sub === 'string') {
        const id = +decoded.sub;
        if (!Number.isNaN(id)) {
          (req as any).user = { id, role: decoded.role, name: decoded.name };
        }
      }
    }
  } catch (_e) {
    // ignore invalid token in optional auth
  }
  next();
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  if (!hdr || !hdr.startsWith('Bearer ')) return res.status(401).json({ error: { message: 'Unauthorized' } });
  const token = hdr.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || !isJwtPayload(decoded) || typeof decoded.sub !== 'string') {
      throw new Error('Invalid token payload');
    }
    const id = +decoded.sub;
    if (Number.isNaN(id)) throw new Error('Invalid token payload');
    (req as any).user = { id, role: decoded.role, name: decoded.name };
    next();
  } catch (_e) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
}
