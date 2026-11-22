const express = require("express");
const usersController = require("./users.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const { updateUserSchema, updatePasswordSchema } = require("./users.validation");

const router = express.Router();

router.get("/password-requests", authMiddleware, roleMiddleware("admin"), usersController.getPasswordRequests.bind(usersController));
router.delete("/password-requests/:id", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), usersController.deletePasswordRequest.bind(usersController));
router.post("/request-password-change", authMiddleware, usersController.requestPasswordChange.bind(usersController));

router.get("/", authMiddleware, roleMiddleware("admin"), usersController.getAll.bind(usersController));
router.get("/:id", authMiddleware, validateObjectId("id"), usersController.getById.bind(usersController));
router.put("/:id", authMiddleware, validateObjectId("id"), validateRequest(updateUserSchema), usersController.update.bind(usersController));
router.put("/:id/password", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), validateRequest(updatePasswordSchema), usersController.updatePassword.bind(usersController));
router.delete("/:id", authMiddleware, validateObjectId("id"), usersController.delete.bind(usersController));

module.exports = router;
