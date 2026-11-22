const { z } = require("zod");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  email: z.string().trim().email("Invalid email format").max(255),
  phone: z.string().trim().min(10, "Phone number must be at least 10 characters").max(20),
  password: z.string().min(6, "Password must be at least 6 characters").max(128, "Password is too long"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
  password: z.string().min(1, "Password is required").max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

const verifyOTPSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyOTPSchema,
  refreshTokenSchema,
};
