import { z } from 'zod';

export const RegisterSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(10, "Numéro de téléphone invalide"),
    password: z.string().min(6),
    role: z.enum(['client','merchant','courier']).default('client'),
    institutionCode: z.string().optional()
  })
});

export const LoginSchema = z.object({
  body: z.object({
    phone: z.string().min(10),
    password: z.string().min(6)
  })
});

export const VerifyOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10),
    otp: z.string().length(6)
  })
});

export const ResendOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10)
  })
});
 
export const RefreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(10) })
});

export type RegisterInput = z.infer<typeof RegisterSchema>["body"];
export type LoginInput = z.infer<typeof LoginSchema>["body"];
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>["body"];
export type ResendOtpInput = z.infer<typeof ResendOtpSchema>["body"];
export type RefreshInput = z.infer<typeof RefreshSchema>["body"];
