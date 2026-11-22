/**
 * Lightweight, zero-dependency sliding-window rate limiter middleware.
 * Designed for sensitive endpoints (auth, password reset, checkout).
 */
const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 15,
  message = "Too many requests. Please try again later.",
  keyPrefix = "global",
  keyGenerator = null,
} = {}) => {
  const hits = new Map();

  // Periodic cleanup to avoid unbounded memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now >= entry.resetAt) {
        hits.delete(key);
      }
    }
  }, Math.max(windowMs, 60 * 1000));

  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }

  const middleware = (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "true") {
      return next();
    }

    const now = Date.now();
    const rawKey = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.socket?.remoteAddress || "unknown";
    const key = `${keyPrefix}:${rawKey}`;

    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        success: false,
        message,
        errorCode: "RATE_LIMIT_EXCEEDED",
      });
    }

    return next();
  };

  middleware._resetStore = () => hits.clear();
  return middleware;
};

const authLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: "auth_login",
  message: "Too many login attempts. Please try again in 15 minutes.",
});

const authRegisterLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: "auth_register",
  message: "Too many registration attempts. Please try again later.",
});

const authPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "auth_password",
  message: "Too many password reset requests. Please try again in 15 minutes.",
});

const authOtpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: "auth_otp",
  message: "Too many OTP verification attempts. Please try again later.",
});

const checkoutLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: "checkout",
  message: "Too many checkout requests. Please wait a moment and try again.",
});

module.exports = {
  createRateLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  authPasswordLimiter,
  authOtpLimiter,
  checkoutLimiter,
};
