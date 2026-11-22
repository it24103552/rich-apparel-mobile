const express = require("express");
const cartController = require("./cart.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const { addToCartSchema, updateCartItemSchema } = require("./cart.validation");

const router = express.Router();

router.get("/", authMiddleware, cartController.getCart.bind(cartController));
router.post("/", authMiddleware, validateRequest(addToCartSchema), cartController.addItem.bind(cartController));
router.put("/:id", authMiddleware, validateObjectId("id"), validateRequest(updateCartItemSchema), cartController.updateItem.bind(cartController));
router.delete("/:id", authMiddleware, validateObjectId("id"), cartController.removeItem.bind(cartController));

module.exports = router;
