const express = require("express");
const returnsController = require("./returns.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const multer = require("../../config/multerMemory");
const { createReturnSchema, updateStatusSchema } = require("./returns.validation");

const router = express.Router();
router.post("/", authMiddleware, multer.single("image"), validateRequest(createReturnSchema), returnsController.create.bind(returnsController));
router.get("/", authMiddleware, roleMiddleware("admin"), returnsController.getAll.bind(returnsController));
router.get("/:id", authMiddleware, validateObjectId("id"), returnsController.getById.bind(returnsController));
router.put("/:id/status", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), validateRequest(updateStatusSchema), returnsController.updateStatus.bind(returnsController));
router.delete("/:id/cancel", authMiddleware, validateObjectId("id"), returnsController.cancelByUser.bind(returnsController));
router.delete("/:id", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), returnsController.delete.bind(returnsController));

module.exports = router;
