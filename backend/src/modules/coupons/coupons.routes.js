const express = require("express");
const couponsController = require("./coupons.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { optionalAuthMiddleware } = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const { createCouponSchema, updateCouponSchema, evaluateCouponSchema } = require("./coupons.validation");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  validateRequest(createCouponSchema),
  couponsController.create.bind(couponsController)
);
router.get("/available", optionalAuthMiddleware, couponsController.getAvailable.bind(couponsController));
router.post(
  "/evaluate",
  optionalAuthMiddleware,
  validateRequest(evaluateCouponSchema),
  couponsController.evaluate.bind(couponsController)
);
router.get("/", authMiddleware, roleMiddleware("admin"), couponsController.getAll.bind(couponsController));
router.get("/validate/:code", optionalAuthMiddleware, couponsController.validate.bind(couponsController));
router.get("/:id", authMiddleware, roleMiddleware("admin"), validateObjectId("id"), couponsController.getById.bind(couponsController));
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  validateObjectId("id"),
  validateRequest(updateCouponSchema),
  couponsController.update.bind(couponsController)
);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  validateObjectId("id"),
  couponsController.delete.bind(couponsController)
);

module.exports = router;
