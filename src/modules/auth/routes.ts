import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma';
import { validate } from '../../middlewares/validate';
import { RegisterSchema, LoginSchema, RefreshSchema, type RegisterInput, type LoginInput } from './dto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { rbac } from '../../middlewares/rbac';
import { asyncHandler } from '../../utils/http';

export const authRouter = Router();

authRouter.post('/register', validate(RegisterSchema), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RegisterInput;
  const { name, email, phone, password, role, institutionCode } = body;

  let institutionId: number | undefined = undefined;
  if (institutionCode) {
    const inst = await prisma.institution.findUnique({ where: { code: institutionCode } });
    if (!inst) return res.status(400).json({ error: { message: 'Invalid institutionCode' } });
    institutionId = inst.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const status = role === 'client' ? 'active' : 'pending';

  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash, role: role as any, status: status as any, institutionId }
  });

  const accessToken = signAccessToken(user.id, user.role as any, user.name);
  const refreshToken = signRefreshToken(user.id, user.role as any);
  res.status(201).json({ user, accessToken, refreshToken });
}));

authRouter.post('/login', validate(LoginSchema), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LoginInput;
  const user = await prisma.user.findFirst({ where: { OR: [ { email: body.email ?? undefined }, { phone: body.phone ?? undefined } ] } });
  if (!user || !user.passwordHash) return res.status(401).json({ error: { message: 'Invalid credentials' } });
  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: { message: 'Invalid credentials' } });
  const accessToken = signAccessToken(user.id, user.role as any, user.name);
  const refreshToken = signRefreshToken(user.id, user.role as any);
  res.json({ user, accessToken, refreshToken });
}));

authRouter.post('/refresh', validate(RefreshSchema), asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user) return res.status(401).json({ error: { message: 'Invalid token' } });
    const accessToken = signAccessToken(user.id, user.role as any, user.name);
    res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: { message: 'Invalid token' } });
  }
}));

authRouter.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
  const u = await prisma.user.findUnique({ where: { id: user.id } });
  res.json(u);
}));

authRouter.post('/logout', (_req: Request, res: Response) => {
  // Stateless JWT: logout is handled client-side (token discard)
  res.json({ ok: true });
});
