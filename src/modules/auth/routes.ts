import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma';
import { validate } from '../../middlewares/validate';
import { RegisterSchema, LoginSchema, RefreshSchema, VerifyOtpSchema, ResendOtpSchema, type RegisterInput, type LoginInput, type VerifyOtpInput, type ResendOtpInput } from './dto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { asyncHandler } from '../../utils/http';
import { smsService } from '../../utils/sms';

export const authRouter = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, password]
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *               institutionCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created, pending verification
 */
authRouter.post('/register', validate(RegisterSchema), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RegisterInput;
  const { name, email, phone, password, role, institutionCode } = body;

  if (!phone) return res.status(400).json({ error: { message: 'Phone required' } });

  // Check if phone already exists
  const existingUser = await prisma.user.findUnique({ where: { phone } });
  if (existingUser) {
    // If user exists but is pending, maybe update? For now, simpler to error.
    return res.status(400).json({ error: { message: 'Phone number already registered' } });
  }

  let institutionId: number | undefined = undefined;
  if (institutionCode) {
    const inst = await prisma.institution.findUnique({ where: { code: institutionCode } });
    if (!inst) return res.status(400).json({ error: { message: 'Invalid institutionCode' } });
    institutionId = inst.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // All new users are pending until OTP verification
  const status = 'pending';
  
  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  const user = await prisma.user.create({
    data: { 
      name, 
      email, 
      phone, 
      passwordHash, 
      role: role as any, 
      status: status as any, 
      institutionId,
      otp,
      otpExpiresAt
    }
  });

  // Send SMS
  await smsService.sendOtp(phone, otp);

  res.status(201).json({ 
    message: 'User registered. Please verify OTP.',
    userId: user.id,
    phone: user.phone
  });
}));

/**
 * @swagger
 * /api/v1/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and activate account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account verified, returns tokens
 */
authRouter.post('/verify-otp', validate(VerifyOtpSchema), asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp } = req.body as VerifyOtpInput;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return res.status(404).json({ error: { message: 'User not found' } });

  if (user.status !== 'pending') {
     // If already active, allow verify to proceed (idempotent) or error?
     // Logic: if active, just return tokens
     if (user.status === 'active') {
        const accessToken = signAccessToken(user.id, user.role as any, user.name);
        const refreshToken = signRefreshToken(user.id, user.role as any);
        return res.json({ user, accessToken, refreshToken });
     }
  }

  if (!user.otp || !user.otpExpiresAt) {
    return res.status(400).json({ error: { message: 'No OTP pending' } });
  }

  if (new Date() > user.otpExpiresAt) {
    return res.status(400).json({ error: { message: 'OTP expired' } });
  }

  if (user.otp !== otp) {
    return res.status(400).json({ error: { message: 'Invalid OTP' } });
  }

  // Determine final status
  const newStatus = user.role === 'client' ? 'active' : 'pending'; // Merchants stay pending for admin approval

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      status: newStatus,
      otp: null,
      otpExpiresAt: null
    }
  });

  const accessToken = signAccessToken(updated.id, updated.role as any, updated.name);
  const refreshToken = signRefreshToken(updated.id, updated.role as any);

  res.json({ user: updated, accessToken, refreshToken });
}));

authRouter.post('/resend-otp', validate(ResendOtpSchema), asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body as ResendOtpInput;
  
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return res.status(404).json({ error: { message: 'User not found' } });

  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpExpiresAt }
  });

  await smsService.sendOtp(phone, otp);

  res.json({ message: 'OTP resent' });
}));

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
authRouter.post('/login', validate(LoginSchema), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LoginInput;
  
  const user = await prisma.user.findUnique({ where: { phone: body.phone } });
  if (!user || !user.passwordHash) return res.status(401).json({ error: { message: 'Invalid credentials' } });
  
  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: { message: 'Invalid credentials' } });

  // Check status
  if (user.status === 'suspended') return res.status(403).json({ error: { message: 'Account suspended' } });
  
  // If pending and has OTP, verify required
  if (user.status === 'pending' && user.otp) {
     return res.status(403).json({ error: { message: 'Account verification pending', code: 'VERIFY_OTP', phone: user.phone } });
  }

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
