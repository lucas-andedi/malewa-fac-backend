import { z } from 'zod';

export const RegisterSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(5).optional(),
    password: z.string().min(6),
    role: z.enum(['client','merchant','courier']).default('client'),
    institutionCode: z.string().optional()
  })
});

export const LoginSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    password: z.string().min(6)
  }).refine((v)=> !!v.email || !!v.phone, { message: 'email or phone required', path: ['email'] })
});
 
export const RefreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(10) })
});

export type RegisterInput = z.infer<typeof RegisterSchema>["body"];
export type LoginInput = z.infer<typeof LoginSchema>["body"];
export type RefreshInput = z.infer<typeof RefreshSchema>["body"];
