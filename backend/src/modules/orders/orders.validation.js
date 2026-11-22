const { z } = require("zod");
const { OBJECT_ID_REGEX } = require("../../middleware/objectId.middleware");

const DELIVERY_METHODS = ["standard_delivery", "express_delivery", "pickup"];
const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

const orderItemSchema = z.object({
  productId: z.string().regex(OBJECT_ID_REGEX, "Invalid productId format"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Quantity cannot exceed 99 per item"),
  // Accepted optionally for backward compatibility with existing clients,
  // but strictly ignored by the backend (authoritative price is fetched from DB).
  price: z.coerce.number().optional(),
  variantAttributes: z.any().optional(),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Order must have at least one item").max(50, "Too many line items"),
  // Accepted optionally for backward compatibility; backend recalculates authoritatively.
  total: z.coerce.number().optional(),
  shippingFee: z.coerce.number().optional(),
  address: z.string().trim().min(10, "Address must be at least 10 characters").max(500, "Address is too long"),
  contactNumber: z.string().trim().regex(/^\d{10}$/, "Contact number must be exactly 10 digits"),
  contactEmail: z.string().trim().email("Valid contact email is required"),
  deliveryMethod: z.enum(DELIVERY_METHODS, {
    errorMap: () => ({ message: "deliveryMethod must be standard_delivery, express_delivery, or pickup" }),
  }),
  couponCode: z.string().trim().max(50).optional().default(""),
  pointsUsed: z.coerce.number().int("Points must be a whole number").min(0, "Points cannot be negative").optional().default(0),
});

const quoteOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Order must have at least one item").max(50),
  deliveryMethod: z.enum(DELIVERY_METHODS, {
    errorMap: () => ({ message: "deliveryMethod must be standard_delivery, express_delivery, or pickup" }),
  }).optional().default("standard_delivery"),
  couponCode: z.string().trim().max(50).optional().default(""),
  pointsUsed: z.coerce.number().int().min(0).optional().default(0),
});

const updateOrderSchema = z
  .object({
    address: z.string().trim().min(10, "Address must be at least 10 characters").max(500).optional(),
    contactNumber: z.string().trim().regex(/^\d{10}$/, "Contact number must be exactly 10 digits").optional(),
    contactEmail: z.string().trim().email("Valid contact email is required").optional(),
    deliveryMethod: z
      .enum(DELIVERY_METHODS, {
        errorMap: () => ({ message: "deliveryMethod must be standard_delivery, express_delivery, or pickup" }),
      })
      .optional(),
  })
  .refine(
    (data) => Object.values(data).some((val) => val !== undefined),
    "At least one field must be provided for update"
  );

const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, {
    errorMap: () => ({ message: `status must be one of: ${ORDER_STATUSES.join(", ")}` }),
  }),
});

const discountRequestSchema = z.object({
  couponCode: z.string().trim().max(50).optional().default(""),
  pointsUsed: z.coerce.number().int().min(0).optional().default(0),
});

module.exports = {
  DELIVERY_METHODS,
  ORDER_STATUSES,
  createOrderSchema,
  quoteOrderSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
  discountRequestSchema,
};
