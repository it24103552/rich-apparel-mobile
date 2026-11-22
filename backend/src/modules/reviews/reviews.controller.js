const { hasAnyRole } = require("../../middleware/role.middleware");
const reviewsService = require("./reviews.service");
const { sendSuccess, sendError } = require("../../utils/response");
const supabase = require("../../config/supabase");
const path = require("path");

class ReviewsController {
  async create(req, res) {
    try {
      let imageUrl = null;

      if (req.file) {
        const fileExt = path.extname(req.file.originalname);
        const fileName = `rev_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExt}`;
        const filePath = `reviews/${fileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });

        if (uploadError) {
          console.error("❌ Supabase Upload Error (Reviews):", uploadError);
          throw new Error(`Cloud upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      const review = await reviewsService.create(
        { ...req.body, userId: req.user.id },
        imageUrl
      );
      return sendSuccess(res, "Review created", review, 201);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getAll(req, res) {
    try {
      const { skip = 0, take = 10, productId } = req.query;
      const reviews = await reviewsService.getAll(parseInt(skip), parseInt(take), productId);
      const total = await reviewsService.getTotalCount(productId);
      return sendSuccess(res, "Reviews fetched", { reviews, total });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getById(req, res) {
    try {
      const review = await reviewsService.getById(req.params.id);
      if (!review || review.isDeleted) {
        return sendError(res, "Review not found", 404);
      }
      return sendSuccess(res, "Review fetched", review);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getMine(req, res) {
    try {
      const { skip = 0, take = 10 } = req.query;
      const reviews = await reviewsService.getByUser(req.user.id, parseInt(skip), parseInt(take));
      return sendSuccess(res, "Your reviews fetched", { reviews });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async update(req, res) {
    try {
      let imageUrl = undefined;

      if (req.file) {
        const fileExt = path.extname(req.file.originalname);
        const fileName = `rev_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExt}`;
        const filePath = `reviews/${fileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });

        if (uploadError) {
          console.error("❌ Supabase Upload Error (Review Update):", uploadError);
          throw new Error(`Cloud upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      const review = await reviewsService.update(req.params.id, req.user.id, req.body, imageUrl);
      return sendSuccess(res, "Review updated", review);
    } catch (error) {
      const statusCode = error.message.includes("Unauthorized") ? 403 : 400;
      return sendError(res, error.message, statusCode);
    }
  }

  async delete(req, res) {
    try {
      const isAdmin = hasAnyRole(req.user.role, ["admin"]);
      await reviewsService.delete(req.params.id, req.user.id, isAdmin);
      return sendSuccess(res, "Review deleted");
    } catch (error) {
      const statusCode = error.message.includes("Unauthorized") ? 403 : 400;
      return sendError(res, error.message, statusCode);
    }
  }
}

module.exports = new ReviewsController();
