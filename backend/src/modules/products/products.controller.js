const productsService = require("./products.service");
const { sendSuccess, sendError } = require("../../utils/response");
const { hasAnyRole } = require("../../middleware/role.middleware");
const { isValidObjectId } = require("../../middleware/objectId.middleware");
const { normalizeProductMedia } = require("../../utils/media");
const supabase = require("../../config/supabase");
const path = require("path");
const crypto = require("crypto");

const ALLOWED_SORTS = new Set([
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "name_asc",
  "name_desc",
]);

class ProductsController {
  async create(req, res) {
    try {
      let imageUrl = null;
      let images = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileExt = path.extname(file.originalname);
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}${fileExt}`;
          const filePath = `products/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("product-images")
            .upload(filePath, file.buffer, {
              contentType: file.mimetype,
            });

          if (uploadError) {
            console.error("❌ Supabase Upload Error:", uploadError.message);
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from("product-images").getPublicUrl(filePath);

          images.push(publicUrl);
        }
      }

      if (req.body.existingImages) {
        try {
          const existing = JSON.parse(req.body.existingImages);
          if (Array.isArray(existing)) {
            images = [...existing, ...images];
          }
        } catch (e) {
          console.warn("Could not parse existingImages JSON:", e.message);
        }
      }

      if (images.length > 0) {
        imageUrl = images[0];
      }

      req.body.images = images;
      if (req.body.variants && typeof req.body.variants === "string") {
        try {
          req.body.variants = JSON.parse(req.body.variants);
        } catch (e) {
          console.warn("Could not parse variants JSON:", e.message);
        }
      }

      if (Array.isArray(req.body.variants)) {
        req.body.variants = req.body.variants.map((v) => ({
          ...v,
          id: v.id || crypto.randomUUID(),
        }));
      }

      if (req.body.isActive !== undefined) {
        req.body.isActive = req.body.isActive === "true" || req.body.isActive === true;
      }

      const product = await productsService.create(req.body, imageUrl, req.user);
      return sendSuccess(res, "Product created", normalizeProductMedia(product, req), 201);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async getAll(req, res) {
    try {
      const {
        skip: rawSkip,
        take: rawTake,
        page: rawPage,
        limit: rawLimit,
        categoryId,
        collection,
        category,
        search,
        q,
        minPrice,
        maxPrice,
        inStock,
        activeOnly,
        isActive,
        sort = "newest",
      } = req.query;

      if (categoryId && !isValidObjectId(categoryId)) {
        return sendError(res, "Invalid categoryId format", 400, null, "INVALID_ID");
      }

      if (sort && !ALLOWED_SORTS.has(String(sort).toLowerCase())) {
        return sendError(
          res,
          `Invalid sort option. Allowed: ${Array.from(ALLOWED_SORTS).join(", ")}`,
          400,
          null,
          "INVALID_SORT"
        );
      }

      const parsedMinPrice = minPrice !== undefined && minPrice !== "" ? Number(minPrice) : null;
      const parsedMaxPrice = maxPrice !== undefined && maxPrice !== "" ? Number(maxPrice) : null;
      if ((parsedMinPrice !== null && !Number.isFinite(parsedMinPrice)) || (parsedMaxPrice !== null && !Number.isFinite(parsedMaxPrice))) {
        return sendError(res, "minPrice and maxPrice must be valid numbers", 400, null, "INVALID_PRICE_FILTER");
      }
      if (parsedMinPrice !== null && parsedMaxPrice !== null && parsedMinPrice > parsedMaxPrice) {
        return sendError(res, "minPrice cannot be greater than maxPrice", 400, null, "INVALID_PRICE_FILTER");
      }

      const usesPagePagination = rawPage !== undefined || rawLimit !== undefined;
      let skip;
      let take;
      let page;
      let limit;

      if (usesPagePagination) {
        page = Math.max(1, parseInt(rawPage, 10) || 1);
        limit = Math.min(Math.max(1, parseInt(rawLimit, 10) || 20), 100);
        skip = (page - 1) * limit;
        take = limit;
      } else {
        skip = Math.max(0, parseInt(rawSkip, 10) || 0);
        take = Math.min(Math.max(1, parseInt(rawTake, 10) || 20), 1000);
        limit = take;
        page = Math.floor(skip / take) + 1;
      }

      const isPrivileged = hasAnyRole(req.user?.role, ["admin", "product manager", "supplier manager"]);

      const filters = {
        categoryId: categoryId || null,
        collection: collection || category || null,
        search: (search || q || "").trim() || null,
        minPrice: parsedMinPrice,
        maxPrice: parsedMaxPrice,
        inStock: inStock === "true",
        activeOnly: activeOnly === "true" || isActive === "true",
        sort: String(sort || "newest").toLowerCase(),
        isPrivileged,
      };

      const { products, total } = await productsService.getAll(skip, take, filters);
      const normalizedProducts = products.map((p) => normalizeProductMedia(p, req));
      const totalPages = Math.max(1, Math.ceil(total / limit));

      return sendSuccess(res, "Products fetched", {
        products: normalizedProducts,
        total,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async getById(req, res) {
    try {
      const isPrivileged = hasAnyRole(req.user?.role, ["admin", "product manager", "supplier manager"]);
      const product = await productsService.getById(req.params.id, { isPrivileged });
      if (!product || product.isDeleted) {
        return sendError(res, "Product not found", 404, null, "PRODUCT_NOT_FOUND");
      }
      return sendSuccess(res, "Product fetched", normalizeProductMedia(product, req));
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async update(req, res) {
    try {
      let imageUrl = null;
      let images = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileExt = path.extname(file.originalname);
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}${fileExt}`;
          const filePath = `products/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("product-images")
            .upload(filePath, file.buffer, {
              contentType: file.mimetype,
            });

          if (uploadError) {
            console.error("❌ Supabase Upload Error:", uploadError.message);
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from("product-images").getPublicUrl(filePath);

          images.push(publicUrl);
        }
      }

      if (req.body.existingImages) {
        try {
          const existing = JSON.parse(req.body.existingImages);
          if (Array.isArray(existing)) {
            images = [...existing, ...images];
          }
        } catch (e) {
          console.warn("Could not parse existingImages JSON:", e.message);
        }
      }

      if (images.length > 0) {
        imageUrl = images[0];
      }

      req.body.images = images;
      if (req.body.variants && typeof req.body.variants === "string") {
        try {
          req.body.variants = JSON.parse(req.body.variants);
        } catch (e) {
          console.warn("Could not parse variants JSON:", e.message);
        }
      }

      if (Array.isArray(req.body.variants)) {
        req.body.variants = req.body.variants.map((v) => ({
          ...v,
          id: v.id || crypto.randomUUID(),
        }));
      }

      if (req.body.isActive !== undefined) {
        req.body.isActive = req.body.isActive === "true" || req.body.isActive === true;
      }

      const product = await productsService.update(req.params.id, req.body, imageUrl, req.user);
      return sendSuccess(res, "Product updated", normalizeProductMedia(product, req));
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async delete(req, res) {
    try {
      await productsService.delete(req.params.id, req.user);
      return sendSuccess(res, "Product deleted");
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async getLowStock(req, res) {
    try {
      const threshold = Math.max(0, parseInt(req.query.threshold, 10) || 5);
      const products = await productsService.getLowStockProducts(threshold);
      return sendSuccess(
        res,
        "Low stock products fetched",
        products.map((p) => normalizeProductMedia(p, req))
      );
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getPopular(req, res) {
    try {
      const parsedLimit = parseInt(req.query.limit, 10);
      const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 10) : 5;
      const result = await productsService.getPopularProducts(limit);
      return sendSuccess(res, "Popular products fetched", {
        ...result,
        products: (result.products || []).map((p) => normalizeProductMedia(p, req)),
      });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new ProductsController();
