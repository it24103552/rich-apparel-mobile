const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      return next();
    } catch (error) {
      const rawIssues = error?.issues || error?.errors || [];
      const formattedErrors = rawIssues.map((issue) => ({
        path: Array.isArray(issue.path) ? issue.path.join(".") : String(issue.path || ""),
        message: issue.message || "Invalid value",
      }));

      const firstMessage = formattedErrors[0]?.message || "Validation error";

      return res.status(400).json({
        success: false,
        message: firstMessage,
        errorCode: "VALIDATION_ERROR",
        errors: formattedErrors,
      });
    }
  };
};

module.exports = validateRequest;
