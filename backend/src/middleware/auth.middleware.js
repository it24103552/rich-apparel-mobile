const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const presenceService = require("../modules/chat/presence.service");

const extractBearerToken = (authHeader) => {
  if (!authHeader || typeof authHeader !== "string") {
    return { token: null, malformed: false };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return { token: null, malformed: true };
  }

  return { token: parts[1], malformed: false };
};

const loadActiveUser = async (decoded) => {
  if (!decoded?.id) return null;

  // Reject refresh tokens used as access tokens
  if (decoded.type === "refresh") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isDeleted: true,
      roleId: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!user || user.isDeleted) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    roleId: user.roleId,
    role: user.role?.name || decoded.role || null,
  };
};

const authMiddleware = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Authentication service misconfigured",
        errorCode: "AUTH_CONFIG_ERROR",
      });
    }

    const { token, malformed } = extractBearerToken(req.headers.authorization);

    if (malformed) {
      return res.status(401).json({
        success: false,
        message: "Malformed Authorization header. Expected 'Bearer <token>'",
        errorCode: "INVALID_AUTH_HEADER",
      });
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. No token provided.",
        errorCode: "AUTH_REQUIRED",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type === "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
        errorCode: "INVALID_TOKEN",
      });
    }

    const activeUser = await loadActiveUser(decoded);
    if (!activeUser) {
      return res.status(401).json({
        success: false,
        message: "Account is no longer active. Please login again.",
        errorCode: "ACCOUNT_INACTIVE",
      });
    }

    req.user = activeUser;

    if (activeUser.id) {
      presenceService.updatePresence(activeUser.id);
    }

    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired. Please login again.",
        errorCode: "TOKEN_EXPIRED",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid token",
      errorCode: "INVALID_TOKEN",
    });
  }
};

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return next();
    }

    const { token, malformed } = extractBearerToken(req.headers.authorization);
    if (token && !malformed) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const activeUser = await loadActiveUser(decoded);
      if (activeUser) {
        req.user = activeUser;
        presenceService.updatePresence(activeUser.id);
      }
    }
  } catch (error) {
    // Invalid or expired optional token: continue cleanly as guest
  }
  return next();
};

module.exports = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
module.exports.extractBearerToken = extractBearerToken;
