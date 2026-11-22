const STATUS_ERROR_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  429: "RATE_LIMIT_EXCEEDED",
  500: "INTERNAL_SERVER_ERROR",
};

const sendResponse = (res, statusCode, success, message, data = null, errorCode = null) => {
  const payload = {
    success,
    message,
  };

  if (!success) {
    payload.errorCode = errorCode || STATUS_ERROR_CODES[statusCode] || "ERROR";
  }

  if (data !== null && data !== undefined) {
    payload.data = data;
  }

  return res.status(statusCode).json(payload);
};

const sendSuccess = (res, message, data = null, statusCode = 200) => {
  return sendResponse(res, statusCode, true, message, data);
};

const sendError = (res, message, statusCode = 400, data = null, errorCode = null) => {
  return sendResponse(res, statusCode, false, message, data, errorCode);
};

module.exports = {
  sendResponse,
  sendSuccess,
  sendError,
  STATUS_ERROR_CODES,
};
