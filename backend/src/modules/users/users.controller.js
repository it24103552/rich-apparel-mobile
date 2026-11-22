const usersService = require("./users.service");
const { sendSuccess, sendError } = require("../../utils/response");
const { hasAnyRole } = require("../../middleware/role.middleware");

class UsersController {
  async getAll(req, res) {
    try {
      const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
      const take = Math.min(Math.max(1, parseInt(req.query.take, 10) || 10), 1000);
      const users = await usersService.getAll(skip, take);
      const total = await usersService.getTotalCount();
      return sendSuccess(res, "Users fetched", { users, total });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getById(req, res) {
    try {
      const targetId = req.params.id;
      const isOwner = req.user.id === targetId;
      const isAdmin = hasAnyRole(req.user.role, ["admin"]);

      if (!isOwner && !isAdmin) {
        return sendError(res, "Forbidden - You can only access your own profile", 403, null, "FORBIDDEN");
      }

      const user = await usersService.getById(targetId);
      if (!user || user.isDeleted) {
        return sendError(res, "User not found", 404, null, "USER_NOT_FOUND");
      }
      return sendSuccess(res, "User fetched", user);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async update(req, res) {
    try {
      const targetId = req.params.id;
      const currentUser = req.user;

      const isOwner = currentUser.id === targetId;
      const isAdmin = hasAnyRole(currentUser.role, ["admin"]);

      if (!isOwner && !isAdmin) {
        return sendError(res, "Forbidden - You can only update your own account", 403, null, "FORBIDDEN");
      }

      // Prevent privilege escalation / mass assignment for non-admin callers
      if (!isAdmin && req.body.roleId !== undefined) {
        return sendError(res, "Forbidden - You cannot change account roles", 403, null, "FORBIDDEN");
      }

      const allowedUpdate = {};
      if (req.body.name !== undefined) allowedUpdate.name = req.body.name.trim();
      if (req.body.phone !== undefined) allowedUpdate.phone = req.body.phone;

      if (isAdmin) {
        if (req.body.email !== undefined) allowedUpdate.email = req.body.email.trim().toLowerCase();
        if (req.body.roleId !== undefined) allowedUpdate.roleId = req.body.roleId;
      } else if (req.body.email !== undefined) {
        // React ProfileForm submits disabled email in payload; allow unchanged email, block changing it arbitrarily
        const incomingEmail = req.body.email.trim().toLowerCase();
        const existingEmail = String(currentUser.email || "").trim().toLowerCase();
        if (incomingEmail !== existingEmail) {
          return sendError(res, "Email address cannot be modified from this endpoint", 403, null, "FORBIDDEN");
        }
      }

      if (Object.keys(allowedUpdate).length === 0) {
        const existing = await usersService.getById(targetId);
        return sendSuccess(res, "User updated", existing);
      }

      const user = await usersService.update(targetId, allowedUpdate);
      return sendSuccess(res, "User updated", user);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async delete(req, res) {
    try {
      const targetId = req.params.id;
      const currentUser = req.user;

      const isOwner = currentUser.id === targetId;
      const isAdmin = hasAnyRole(currentUser.role, ["admin"]);

      if (!isOwner && !isAdmin) {
        return sendError(res, "Forbidden - You can only delete your own account", 403, null, "FORBIDDEN");
      }

      await usersService.delete(targetId);
      return sendSuccess(res, "User deleted");
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async updatePassword(req, res) {
    try {
      const { password } = req.body;
      const user = await usersService.updatePassword(req.params.id, password);
      return sendSuccess(res, "Password updated successfully", user);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async requestPasswordChange(req, res) {
    try {
      await usersService.requestPasswordChange(req.user);
      return sendSuccess(res, "Password change request sent to administrators");
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getPasswordRequests(req, res) {
    try {
      const requests = await usersService.getPasswordRequests();
      return sendSuccess(res, "Password requests fetched", requests);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async deletePasswordRequest(req, res) {
    try {
      await usersService.deletePasswordRequest(req.params.id);
      return sendSuccess(res, "Password request deleted");
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new UsersController();
