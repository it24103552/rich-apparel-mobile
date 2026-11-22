const { z } = require("zod");
const { OBJECT_ID_REGEX } = require("../../middleware/objectId.middleware");

const createCouponSchema = z.object({
  code: z.string().trim().min(2, "Code must be at least 2 characters").max(50),
  discount: z.number().positive("Discount must be positive"),
  discountType: z.enum(["percentage", "fixed"]).optional().default("percentage"),
  minCartValue: z.number().nonnegative("Min cart value must be non-negative").default(0),
  firstOrder: z.boolean().default(false),
  targetType: z.enum(["all", "category", "product"]).default("all"),
  targetCategoryIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional().default([]),
  targetProductIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional().default([]),
  audienceType: z.enum(["all", "new", "specific"]).default("all"),
  audienceUserIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional().default([]),
}).refine(
  (data) => data.discountType !== "percentage" || data.discount <= 100,
  { message: "Percentage discount cannot exceed 100%", path: ["discount"] }
);

const updateCouponSchema = z.object({
  code: z.string().trim().min(2).max(50).optional(),
  discount: z.number().positive().optional(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  minCartValue: z.number().nonnegative().optional(),
  firstOrder: z.boolean().optional(),
  targetType: z.enum(["all", "category", "product"]).optional(),
  targetCategoryIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional(),
  targetProductIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional(),
  audienceType: z.enum(["all", "new", "specific"]).optional(),
  audienceUserIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional(),
}).refine(
  (data) => data.discountType !== "percentage" || data.discount === undefined || data.discount <= 100,
  { message: "Percentage discount cannot exceed 100%", path: ["discount"] }
);

const evaluateCouponSchema = z.object({
  couponCode: z.string().trim().min(1, "Coupon code is required").max(50),
  items: z.array(
    z.object({
      productId: z.string().regex(OBJECT_ID_REGEX, "Invalid productId format"),
      quantity: z.coerce.number().int().min(1).max(99),
      price: z.coerce.number().optional(),
      variantAttributes: z.any().optional(),
    })
  ).min(1, "At least one item is required to evaluate a coupon"),
  total: z.coerce.number().optional(),
});

module.exports = {
  createCouponSchema,
  updateCouponSchema,
  evaluateCouponSchema,
};
