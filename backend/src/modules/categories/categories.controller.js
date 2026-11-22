const categoriesService = require("./categories.service");
const { sendSuccess, sendError } = require("../../utils/response");
const { toAbsoluteMediaUrl } = require("../../utils/media");
const supabase = require("../../config/supabase");
const path = require("path");

class CategoriesController {
  async create(req, res) {
    try {
      let imageUrl = null;

      // Handle image upload to Supabase
      if (req.file) {
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${Date.now()}${fileExt}`;
        const filePath = `categories/${fileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from("product-images") // Using same bucket for simplicity or "category-images" if exists
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      // Parse variantConfig if stringified (from multipart/form-data)
      let variantConfig = req.body.variantConfig;
      if (typeof variantConfig === "string") {
        try {
          variantConfig = JSON.parse(variantConfig);
        } catch (e) {
          variantConfig = null;
        }
      }

      const categoryData = {
        name: req.body.name,
        description: req.body.description,
        imageUrl: imageUrl,
        variantConfig: variantConfig,
        isActive: req.body.isActive === undefined ? true : (req.body.isActive === "true" || req.body.isActive === true)
      };

      const category = await categoriesService.create(categoryData, req.user);
      return sendSuccess(res, "Category created", category, 201);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getAll(req, res) {
    try {
      const { skip: rawSkip, take: rawTake, page: rawPage, limit: rawLimit, activeOnly, includeProducts, search } = req.query;
      const usesPage = rawPage !== undefined || rawLimit !== undefined;
      const page = usesPage ? Math.max(1, parseInt(rawPage, 10) || 1) : null;
      const limit = usesPage ? Math.min(Math.max(1, parseInt(rawLimit, 10) || 20), 100) : null;
      const skip = usesPage ? (page - 1) * limit : Math.max(0, parseInt(rawSkip, 10) || 0);
      const take = usesPage ? limit : Math.min(Math.max(1, parseInt(rawTake, 10) || 20), 1000);

      const isActiveOnly = activeOnly === "true";
      const shouldIncludeProducts = includeProducts !== "false";
      const cleanSearch = (search || "").trim() || null;

      const [categories, total] = await Promise.all([
        categoriesService.getAll(skip, take, isActiveOnly, {
          includeProducts: shouldIncludeProducts,
          search: cleanSearch,
        }),
        categoriesService.getTotalCount(isActiveOnly, cleanSearch),
      ]);

      const normalized = categories.map((cat) => ({
        ...cat,
        imageUrl: cat.imageUrl ? toAbsoluteMediaUrl(cat.imageUrl, req) : cat.imageUrl,
      }));

      const effectiveLimit = take;
      const currentPage = page || Math.floor(skip / effectiveLimit) + 1;
      const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

      return sendSuccess(res, "Categories fetched", {
        categories: normalized,
        total,
        pagination: {
          page: currentPage,
          limit: effectiveLimit,
          total,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1,
        },
      });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getById(req, res) {
    try {
      const category = await categoriesService.getById(req.params.id);
      if (!category || category.isDeleted) {
        return sendError(res, "Category not found", 404, null, "NOT_FOUND");
      }
      return sendSuccess(res, "Category fetched", {
        ...category,
        imageUrl: category.imageUrl ? toAbsoluteMediaUrl(category.imageUrl, req) : category.imageUrl,
      });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async update(req, res) {
    try {
      let imageUrl = req.body.imageUrl; // Keep existing if not changed

      if (req.file) {
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${Date.now()}${fileExt}`;
        const filePath = `categories/${fileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      let variantConfig = req.body.variantConfig;
      if (typeof variantConfig === "string") {
        try {
          variantConfig = JSON.parse(variantConfig);
        } catch (e) {
          // Keep as is or handle error
        }
      }

      const categoryData = {
        ...req.body,
        imageUrl: imageUrl,
        variantConfig: variantConfig,
        isActive: req.body.isActive === undefined ? undefined : (req.body.isActive === "true" || req.body.isActive === true)
      };

      const category = await categoriesService.update(req.params.id, categoryData, req.user);
      return sendSuccess(res, "Category updated", category);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async delete(req, res) {
    try {
      await categoriesService.delete(req.params.id, req.user);
      return sendSuccess(res, "Category deleted");
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new CategoriesController();
