const normalizeRole = (role) => {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
};

const hasAnyRole = (userRole, allowedRoles = []) => {
  const normalizedUserRole = normalizeRole(userRole);
  if (!normalizedUserRole) return false;
  return allowedRoles.some((r) => normalizeRole(r) === normalizedUserRole);
};

const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Please login again",
        errorCode: "AUTH_REQUIRED",
      });
    }

    const userRole = req.user.role || "";

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: "Forbidden - No role assigned to your account",
        errorCode: "FORBIDDEN",
      });
    }

    if (hasAnyRole(userRole, allowedRoles)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Forbidden - Insufficient permissions",
      errorCode: "FORBIDDEN",
    });
  };
};

module.exports = roleMiddleware;
module.exports.normalizeRole = normalizeRole;
module.exports.hasAnyRole = hasAnyRole;
