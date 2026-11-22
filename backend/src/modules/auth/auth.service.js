const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const prisma = require("../../config/prisma");
const { sendEmail } = require("../../config/mailer");

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const formatSafeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone || null,
  role: user.role?.name || null,
  roleId: user.roleId || null,
  createdAt: user.createdAt,
});

class AuthService {
  #issueTokens(user) {
    const roleName = user.role?.name || null;

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: roleName,
        type: "access",
      },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      {
        id: user.id,
        type: "refresh",
      },
      getRefreshSecret(),
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    return {
      token,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    };
  }

  async register(data) {
    const { name, phone, password } = data;
    const normalizedEmail = String(data.email || "").trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });
    if (existingUser) {
      const err = new Error("User already exists");
      err.status = 409;
      err.errorCode = "USER_ALREADY_EXISTS";
      throw err;
    }

    const customerRole = await prisma.role.findFirst({
      where: { name: { equals: "Customer", mode: "insensitive" }, isDeleted: false },
    });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || null,
        password: hashedPassword,
        roleId: customerRole?.id,
      },
      include: { role: true },
    });

    await prisma.cart.create({
      data: { userId: user.id },
    });

    return formatSafeUser(user);
  }

  async login(data) {
    const normalizedEmail = String(data.email || "").trim();
    const { password } = data;

    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      include: { role: true },
    });

    if (!user || user.isDeleted) {
      const err = new Error("Invalid credentials");
      err.status = 401;
      err.errorCode = "INVALID_CREDENTIALS";
      throw err;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const err = new Error("Invalid credentials");
      err.status = 401;
      err.errorCode = "INVALID_CREDENTIALS";
      throw err;
    }

    const tokens = this.#issueTokens(user);

    return {
      ...tokens,
      user: formatSafeUser(user),
    };
  }

  async getCurrentUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || user.isDeleted) {
      const err = new Error("User account not found or inactive");
      err.status = 401;
      err.errorCode = "ACCOUNT_INACTIVE";
      throw err;
    }

    return formatSafeUser(user);
  }

  async refresh(refreshToken) {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, getRefreshSecret());
    } catch (error) {
      const err = new Error(
        error?.name === "TokenExpiredError"
          ? "Refresh token has expired. Please login again."
          : "Invalid refresh token"
      );
      err.status = 401;
      err.errorCode = error?.name === "TokenExpiredError" ? "REFRESH_TOKEN_EXPIRED" : "INVALID_REFRESH_TOKEN";
      throw err;
    }

    if (decoded?.type !== "refresh" || !decoded?.id) {
      const err = new Error("Invalid refresh token");
      err.status = 401;
      err.errorCode = "INVALID_REFRESH_TOKEN";
      throw err;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { role: true },
    });

    if (!user || user.isDeleted) {
      const err = new Error("Account is no longer active");
      err.status = 401;
      err.errorCode = "ACCOUNT_INACTIVE";
      throw err;
    }

    const tokens = this.#issueTokens(user);

    return {
      ...tokens,
      user: formatSafeUser(user),
    };
  }

  generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
  }

  async forgotPassword(data) {
    const normalizedEmail = String(data.email || "").trim();

    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" }, isDeleted: false },
    });
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      err.errorCode = "USER_NOT_FOUND";
      throw err;
    }

    const otp = this.generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate any previous unused OTPs for this email & purpose
    await prisma.oTP.deleteMany({
      where: { email: user.email, purpose: "password_reset" },
    });

    await prisma.oTP.create({
      data: {
        email: user.email,
        code: otp,
        purpose: "password_reset",
        expiresAt,
      },
    });

    await sendEmail(
      user.email,
      "Password Reset OTP",
      `Your OTP for password reset is: ${otp}. This OTP will expire in 15 minutes.`,
      `<p>Your OTP for password reset is: <strong>${otp}</strong></p><p>This OTP will expire in 15 minutes.</p>`
    );

    return { message: "OTP sent to your email" };
  }

  async verifyOTP(data) {
    const normalizedEmail = String(data.email || "").trim();
    const { otp } = data;

    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" }, isDeleted: false },
    });
    if (!user) {
      throw new Error("Invalid OTP");
    }

    const otpRecord = await prisma.oTP.findFirst({
      where: {
        email: user.email,
        code: otp,
        purpose: "password_reset",
      },
    });

    if (!otpRecord) {
      throw new Error("Invalid OTP");
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new Error("OTP has expired");
    }

    return { message: "OTP verified successfully" };
  }

  async resetPassword(data) {
    const normalizedEmail = String(data.email || "").trim();
    const { otp, password } = data;

    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" }, isDeleted: false },
    });
    if (!user) {
      throw new Error("Invalid OTP");
    }

    const otpRecord = await prisma.oTP.findFirst({
      where: {
        email: user.email,
        code: otp,
        purpose: "password_reset",
      },
    });

    if (!otpRecord) {
      throw new Error("Invalid OTP");
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new Error("OTP has expired");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await prisma.oTP.deleteMany({
      where: { email: user.email, purpose: "password_reset" },
    });

    return { message: "Password reset successfully" };
  }
}

module.exports = new AuthService();
