const express = require("express");
const rolesController = require("./roles.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const { createRoleSchema, updateRoleSchema } = require("./roles.validation");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  validateRequest(createRoleSchema),
  rolesController.create.bind(rolesController)
);
router.get("/", authMiddleware, roleMiddleware("admin"), rolesController.getAll.bind(rolesController));
router.get("/:id", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), rolesController.getById.bind(rolesController));
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  validateObjectId("id"),
  validateRequest(updateRoleSchema),
  rolesController.update.bind(rolesController)
);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  validateObjectId("id"),
  rolesController.delete.bind(rolesController)
);

module.exports = router;
