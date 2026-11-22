require("dotenv").config();
const express = require("express");
const cors = require("cors");
const routes = require("./routes/index.js");
const errorMiddleware = require("./middleware/error.middleware");

const app = express();

// Hide Express server fingerprint
app.disable("x-powered-by");

// Trust reverse proxy headers (X-Forwarded-For, X-Forwarded-Proto) for HTTPS & rate limiting
const trustProxyValue = process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) || 1 : 1;
app.set("trust proxy", trustProxyValue);

// Lightweight security headers (no extra dependency required)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");

  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (process.env.NODE_ENV === "production" || isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Optional strict HTTPS enforcement for staging/production deployments behind a TLS proxy
app.use((req, res, next) => {
  if (process.env.ENFORCE_HTTPS === "true" && req.path !== "/health") {
    const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol;
    if (proto !== "https") {
      return res.status(403).json({
        success: false,
        message: "HTTPS is required for API requests",
        errorCode: "HTTPS_REQUIRED",
      });
    }
  }
  return next();
});

// Environment-aware CORS configuration
// Note: Native Flutter mobile HTTP clients do not send browser Origin headers and are always allowed.
const buildAllowedOrigins = () => {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.FRONTEND_URL) {
    configured.push(process.env.FRONTEND_URL.trim().replace(/\/+$/, ""));
  }

  if (process.env.NODE_ENV !== "production") {
    configured.push(
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174"
    );
  }

  return new Set(configured.map((o) => o.replace(/\/+$/, "")));
};

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser / native mobile clients (no Origin header)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = buildAllowedOrigins();
    const normalizedOrigin = origin.replace(/\/+$/, "");

    if (allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use("/uploads", express.static("uploads"));

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Server is running",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/v1", routes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    errorCode: "ROUTE_NOT_FOUND",
  });
});

// Error Handler
app.use(errorMiddleware);

module.exports = app;
module.exports.buildAllowedOrigins = buildAllowedOrigins;
