const express = require("express");
const ordersController = require("./orders.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const { checkoutLimiter } = require("../../middleware/rateLimit.middleware");
const {
  createOrderSchema,
  quoteOrderSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
  discountRequestSchema,
} = require("./orders.validation");

const router = express.Router();

// Authoritative shipping rules & live server-side checkout quote
router.get("/shipping-config", ordersController.getShippingConfig.bind(ordersController));
router.post("/quote", authMiddleware, validateRequest(quoteOrderSchema), ordersController.quote.bind(ordersController));

router.post("/", authMiddleware, checkoutLimiter, validateRequest(createOrderSchema), ordersController.create.bind(ordersController));
router.post("/return-replacement", authMiddleware, roleMiddleware("admin", "product manager"), ordersController.createReturnOrder.bind(ordersController));
router.get("/", authMiddleware, ordersController.getAll.bind(ordersController));
router.get("/:id", authMiddleware, validateObjectId("id"), ordersController.getById.bind(ordersController));
router.put("/:id", authMiddleware, validateObjectId("id"), validateRequest(updateOrderSchema), ordersController.updateByUser.bind(ordersController));
router.delete("/:id/cancel", authMiddleware, validateObjectId("id"), ordersController.cancelByUser.bind(ordersController));
router.put("/:id/status", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), validateRequest(updateOrderStatusSchema), ordersController.updateStatus.bind(ordersController));
router.post("/:id/refund", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), ordersController.processRefund.bind(ordersController));
router.delete("/:id", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), ordersController.delete.bind(ordersController));
router.post("/:id/apply-discount", authMiddleware, validateObjectId("id"), validateRequest(discountRequestSchema), ordersController.applyDiscount.bind(ordersController));
router.post("/:id/save-discount", authMiddleware, validateObjectId("id"), validateRequest(discountRequestSchema), ordersController.saveDiscount.bind(ordersController));
router.get("/:id/discount", authMiddleware, validateObjectId("id"), ordersController.getDiscountDetails.bind(ordersController));

module.exports = router;
