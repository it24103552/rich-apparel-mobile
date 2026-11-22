const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

const isValidObjectId = (value) => {
  return typeof value === "string" && OBJECT_ID_REGEX.test(value);
};

const validateObjectId = (...paramNames) => {
  const names = paramNames.length > 0 ? paramNames : ["id"];
  return (req, res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (value !== undefined && !isValidObjectId(value)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${name} format`,
          errorCode: "INVALID_ID",
        });
      }
    }
    return next();
  };
};

module.exports = {
  OBJECT_ID_REGEX,
  isValidObjectId,
  validateObjectId,
};
