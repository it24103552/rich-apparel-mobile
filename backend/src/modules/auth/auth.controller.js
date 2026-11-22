const authService = require("./auth.service");
const { sendSuccess, sendError } = require("../../utils/response");

class AuthController {
  async register(req, res) {
    try {
      const result = await authService.register(req.body);
      return sendSuccess(res, "User registered successfully", result, 201);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async login(req, res) {
    try {
      const result = await authService.login(req.body);
      return sendSuccess(res, "Login successful", result);
    } catch (error) {
      return sendError(res, error.message, error.status || 401, null, error.errorCode || "INVALID_CREDENTIALS");
    }
  }

  async me(req, res) {
    try {
      const user = await authService.getCurrentUser(req.user.id);
      return sendSuccess(res, "Authenticated user fetched", user);
    } catch (error) {
      return sendError(res, error.message, error.status || 401, null, error.errorCode);
    }
  }

  async refresh(req, res) {
    try {
      const result = await authService.refresh(req.body.refreshToken);
      return sendSuccess(res, "Token refreshed", result);
    } catch (error) {
      return sendError(res, error.message, error.status || 401, null, error.errorCode || "INVALID_REFRESH_TOKEN");
    }
  }

  async logout(req, res) {
    return sendSuccess(res, "Logged out successfully");
  }

  async forgotPassword(req, res) {
    try {
      const result = await authService.forgotPassword(req.body);
      return sendSuccess(res, result.message);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async resetPassword(req, res) {
    try {
      const result = await authService.resetPassword(req.body);
      return sendSuccess(res, result.message);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async verifyOTP(req, res) {
    try {
      const result = await authService.verifyOTP(req.body);
      return sendSuccess(res, result.message);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }
}

module.exports = new AuthController();
