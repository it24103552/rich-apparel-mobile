const errorMiddleware = (err, req, res, next) => {
  // Log server-side without exposing secrets or leaking internals to clients
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err?.message || err);

  // Invalid JSON body
  if (err?.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400)) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON payload",
      errorCode: "INVALID_JSON",
    });
  }

  // Multer upload errors
  if (err?.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Uploaded file exceeds the maximum allowed size",
        errorCode: "FILE_TOO_LARGE",
      });
    }
    return res.status(400).json({
      success: false,
      message: "File upload error",
      errorCode: "UPLOAD_ERROR",
    });
  }

  if (err?.message === "Only images are allowed") {
    return res.status(400).json({
      success: false,
      message: "Only JPEG, PNG, and GIF image files are allowed",
      errorCode: "INVALID_FILE_TYPE",
    });
  }

  // CORS origin rejection
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed",
      errorCode: "CORS_FORBIDDEN",
    });
  }

  // Prisma known error codes
  if (err?.code === "P2023") {
    return res.status(400).json({
      success: false,
      message: "Invalid resource identifier",
      errorCode: "INVALID_ID",
    });
  }
  if (err?.code === "P2025") {
    return res.status(404).json({
      success: false,
      message: "Requested resource was not found",
      errorCode: "NOT_FOUND",
    });
  }
  if (err?.code === "P2002") {
    return res.status(409).json({
      success: false,
      message: "A record with this unique value already exists",
      errorCode: "CONFLICT",
    });
  }

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;

  const isServerError = status >= 500;
  const message = isServerError
    ? "Internal server error"
    : (err?.message || "Request failed");

  const errorCode = err?.errorCode || (isServerError ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR");

  return res.status(status).json({
    success: false,
    message,
    errorCode,
  });
};

module.exports = errorMiddleware;
