const express = require("express");
const authController = require("./auth.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const {
  authLoginLimiter,
  authRegisterLimiter,
  authPasswordLimiter,
  authOtpLimiter,
} = require("../../middleware/rateLimit.middleware");
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyOTPSchema,
  refreshTokenSchema,
} = require("./auth.validation");

const router = express.Router();

router.post("/register", authRegisterLimiter, validateRequest(registerSchema), authController.register.bind(authController));
router.post("/login", authLoginLimiter, validateRequest(loginSchema), authController.login.bind(authController));
router.post("/refresh", authLoginLimiter, validateRequest(refreshTokenSchema), authController.refresh.bind(authController));
router.get("/me", authMiddleware, authController.me.bind(authController));
router.post("/logout", authMiddleware, authController.logout.bind(authController));
router.post("/forgot-password", authPasswordLimiter, validateRequest(forgotPasswordSchema), authController.forgotPassword.bind(authController));
router.post("/verify-otp", authOtpLimiter, validateRequest(verifyOTPSchema), authController.verifyOTP.bind(authController));
router.post("/reset-password", authPasswordLimiter, validateRequest(resetPasswordSchema), authController.resetPassword.bind(authController));

module.exports = router;
