const { z } = require("zod");
const { OBJECT_ID_REGEX } = require("../../middleware/objectId.middleware");

const addToCartSchema = z.object({
  productId: z.string().regex(OBJECT_ID_REGEX, "Invalid productId format"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Quantity cannot exceed 99 per item"),
  variantAttributes: z.record(z.string(), z.any()).nullable().optional(),
});

const updateCartItemSchema = z.object({
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Quantity cannot exceed 99 per item"),
});

module.exports = {
  addToCartSchema,
  updateCartItemSchema,
};
