const { z } = require("zod");
const { OBJECT_ID_REGEX } = require("../../middleware/objectId.middleware");

const createReviewSchema = z.object({
  productId: z.string().regex(OBJECT_ID_REGEX, "Invalid productId format"),
  rating: z.coerce.number().int().min(1, "Rating must be at least 1").max(5, "Rating must be at most 5"),
  comment: z.string().trim().min(5, "Comment must be at least 5 characters").max(2000, "Comment is too long"),
});

const updateReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(5).max(2000).optional(),
});

module.exports = {
  createReviewSchema,
  updateReviewSchema,
};
