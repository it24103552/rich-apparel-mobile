const express = require("express");
const paymentsController = require("./payments.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const { checkoutLimiter } = require("../../middleware/rateLimit.middleware");
const multer = require("../../config/multerMemory");
const { createPaymentSchema, updatePaymentStatusSchema } = require("./payments.validation");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  checkoutLimiter,
  multer.single("proofImage"),
  validateRequest(createPaymentSchema),
  paymentsController.create.bind(paymentsController)
);
router.get("/", authMiddleware, roleMiddleware("admin"), paymentsController.getAll.bind(paymentsController));
router.get("/:id", authMiddleware, validateObjectId("id"), paymentsController.getById.bind(paymentsController));
router.put(
  "/:id/status",
  authMiddleware,
  roleMiddleware("admin"),
  validateObjectId("id"),
  validateRequest(updatePaymentStatusSchema),
  paymentsController.updateStatus.bind(paymentsController)
);

module.exports = router;
