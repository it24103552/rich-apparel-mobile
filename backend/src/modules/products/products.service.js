const prisma = require("../../config/prisma");
const notificationsService = require("../notifications/notifications.service");
const activitiesService = require("../activities/activities.service");

const PUBLIC_LIST_SELECT = {
  id: true,
  name: true,
  sku: true,
  description: true,
  price: true,
  stock: true,
  imageUrl: true,
  images: true,
  variants: true,
  isActive: true,
  categoryId: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      isActive: true,
      variantConfig: true,
    },
  },
  // Compact rating projection keeps ProductCard star ratings working without bloating payload
  reviews: {
    where: { isDeleted: false },
    select: {
      rating: true,
      isDeleted: true,
    },
  },
};

const PUBLIC_DETAIL_SELECT = {
  ...PUBLIC_LIST_SELECT,
  reviews: {
    where: { isDeleted: false },
    select: {
      id: true,
      rating: true,
      comment: true,
      imageUrl: true,
      userId: true,
      isDeleted: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};

const COLLECTION_KEYWORDS = {
  women: ["women", "womens", "female", "girl", "unisex"],
  men: ["men", "mens", "male", "boy", "unisex"],
  sporty: ["kids", "sport", "active", "athletic", "gym", "fitness"],
  kids: ["kids", "sport", "active", "athletic", "gym", "fitness"],
};

const appendReviewMetrics = (product) => {
  if (!product) return product;
  const activeReviews = Array.isArray(product.reviews)
    ? product.reviews.filter((r) => !r.isDeleted && typeof r.rating === "number")
    : [];
  const reviewCount = activeReviews.length;
  const averageRating =
    reviewCount > 0
      ? Math.round((activeReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10) / 10
      : 0;

  return {
    ...product,
    reviewCount,
    averageRating,
  };
};

class ProductsService {
  #buildOrderBy(sort = "newest") {
    switch (sort) {
      case "oldest":
        return { createdAt: "asc" };
      case "price_asc":
        return { price: "asc" };
      case "price_desc":
        return { price: "desc" };
      case "name_asc":
        return { name: "asc" };
      case "name_desc":
        return { name: "desc" };
      case "newest":
      default:
        return { createdAt: "desc" };
    }
  }

  #buildWhere(filters = {}) {
    const andClauses = [{ isDeleted: false }];

    if (filters.categoryId) {
      andClauses.push({ categoryId: filters.categoryId });
    }

    if (filters.activeOnly) {
      andClauses.push({ isActive: true });
      andClauses.push({ category: { isDeleted: false, isActive: { not: false } } });
    }

    if (filters.inStock) {
      andClauses.push({ stock: { gt: 0 } });
    }

    if (filters.minPrice !== null && filters.minPrice !== undefined) {
      andClauses.push({ price: { gte: filters.minPrice } });
    }

    if (filters.maxPrice !== null && filters.maxPrice !== undefined) {
      andClauses.push({ price: { lte: filters.maxPrice } });
    }

    if (filters.search) {
      const q = filters.search;
      andClauses.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { category: { name: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    if (filters.collection && filters.collection.toLowerCase() !== "all") {
      const colKey = filters.collection.toLowerCase().trim();
      const keywords = COLLECTION_KEYWORDS[colKey];
      if (keywords) {
        const keywordOr = keywords.map((kw) => ({
          category: { name: { contains: kw, mode: "insensitive" } },
        }));
        if (colKey === "men") {
          andClauses.push({
            AND: [
              { OR: keywordOr },
              { NOT: { category: { name: { contains: "women", mode: "insensitive" } } } },
            ],
          });
        } else {
          andClauses.push({ OR: keywordOr });
        }
      } else {
        andClauses.push({
          category: { name: { contains: filters.collection, mode: "insensitive" } },
        });
      }
    }

    return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
  }

  async create(data, imageUrl, user) {
    const { images, existingImages, ...restData } = data;
    const product = await prisma.product.create({
      data: {
        ...restData,
        imageUrl,
        images: images || [],
      },
      include: { category: true, supplier: true },
    });

    await activitiesService.log({
      type: "ACTION",
      action: "CREATE_PRODUCT",
      userId: user?.id,
      userName: user?.name,
      roleName: user?.role?.name || user?.role,
      targetId: product.id,
      targetName: product.name,
      message: `Product "${product.name}" created by ${user?.name || "System"}`,
      details: { sku: product.sku, price: product.price, stock: product.stock },
    });

    await notificationsService.checkLowStock(product);

    return product;
  }

  async getAll(skip = 0, take = 20, filtersOrCategoryId = null) {
    const filters =
      typeof filtersOrCategoryId === "string"
        ? { categoryId: filtersOrCategoryId }
        : filtersOrCategoryId || {};

    const where = this.#buildWhere(filters);
    const orderBy = this.#buildOrderBy(filters.sort);

    const queryOptions = filters.isPrivileged
      ? {
          where,
          include: {
            category: true,
            supplier: true,
            reviews: { where: { isDeleted: false }, select: { rating: true, isDeleted: true } },
          },
          skip,
          take,
          orderBy,
        }
      : {
          where,
          select: PUBLIC_LIST_SELECT,
          skip,
          take,
          orderBy,
        };

    const [rows, total] = await Promise.all([
      prisma.product.findMany(queryOptions),
      prisma.product.count({ where }),
    ]);

    return {
      products: rows.map(appendReviewMetrics),
      total,
    };
  }

  async getById(id, { isPrivileged = false } = {}) {
    const queryOptions = isPrivileged
      ? {
          where: { id },
          include: {
            category: true,
            supplier: true,
            reviews: {
              where: { isDeleted: false },
              select: {
                id: true,
                rating: true,
                comment: true,
                imageUrl: true,
                userId: true,
                isDeleted: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        }
      : {
          where: { id },
          select: PUBLIC_DETAIL_SELECT,
        };

    const product = await prisma.product.findUnique(queryOptions);
    return appendReviewMetrics(product);
  }

  async update(id, data, imageUrl, user) {
    const oldProduct = await this.getById(id, { isPrivileged: true });
    if (!oldProduct || oldProduct.isDeleted) {
      const err = new Error("Product not found");
      err.status = 404;
      err.errorCode = "PRODUCT_NOT_FOUND";
      throw err;
    }

    const updateData = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = parseFloat(data.price) || 0;
    if (data.costPrice !== undefined) updateData.costPrice = parseFloat(data.costPrice) || 0;
    if (data.stock !== undefined) updateData.stock = parseInt(data.stock, 10) || 0;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;
    if (data.isActive !== undefined) updateData.isActive = data.isActive === true || data.isActive === "true";
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.images !== undefined) updateData.images = data.images;

    if (data.variants && Array.isArray(data.variants)) {
      updateData.variants = data.variants.map((v) => ({
        ...v,
        stock: parseInt(v.stock, 10) || 0,
        priceAdj: parseFloat(v.priceAdj) || 0,
      }));
      updateData.stock = updateData.variants.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
    }

    if (imageUrl) {
      updateData.imageUrl = imageUrl;
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
      include: { category: true, supplier: true },
    });

    await notificationsService.checkRestock(updatedProduct, oldProduct.stock);
    await notificationsService.checkLowStock(updatedProduct);

    await activitiesService.log({
      type: "ACTION",
      action: "UPDATE_PRODUCT",
      userId: user?.id,
      userName: user?.name,
      roleName: user?.role?.name || user?.role,
      targetId: updatedProduct.id,
      targetName: updatedProduct.name,
      message: `Product "${updatedProduct.name}" updated by ${user?.name || "System"}`,
      details: {
        fieldsChanged: Object.keys(updateData),
        newPrice: updatedProduct.price,
        newStock: updatedProduct.stock,
      },
    });

    return updatedProduct;
  }

  async delete(id, user) {
    const product = await this.getById(id, { isPrivileged: true });
    if (!product || product.isDeleted) {
      const err = new Error("Product not found");
      err.status = 404;
      err.errorCode = "PRODUCT_NOT_FOUND";
      throw err;
    }

    const deletedProduct = await prisma.product.update({
      where: { id },
      data: { isDeleted: true },
    });

    await activitiesService.log({
      type: "ACTION",
      action: "DELETE_PRODUCT",
      userId: user?.id,
      userName: user?.name,
      roleName: user?.role?.name || user?.role,
      targetId: id,
      targetName: product?.name,
      message: `Product "${product?.name || id}" deleted by ${user?.name || "System"}`,
      details: { sku: product?.sku },
    });

    return deletedProduct;
  }

  async getTotalCount(categoryId = null) {
    const where = { isDeleted: false };
    if (categoryId) {
      where.categoryId = categoryId;
    }
    return prisma.product.count({ where });
  }

  async getLowStockProducts(threshold = 10) {
    return prisma.product.findMany({
      where: {
        isDeleted: false,
        stock: { lte: threshold },
      },
    });
  }

  async getPopularProducts(limit = 5) {
    const orders = await prisma.order.findMany({
      where: {
        isDeleted: false,
        status: { not: "cancelled" },
      },
      select: {
        createdAt: true,
        method: true,
        items: {
          select: {
            productId: true,
            quantity: true,
          },
        },
      },
    });

    const validOrders = orders.filter((o) => o.method !== "return_replacement");
    if (validOrders.length === 0) {
      return { products: [], windowDays: null };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const aggregateQuantities = (orderList) => {
      const counts = new Map();
      for (const order of orderList) {
        for (const item of order.items || []) {
          if (!item.productId || !item.quantity || item.quantity <= 0) continue;
          counts.set(item.productId, (counts.get(item.productId) || 0) + item.quantity);
        }
      }
      return counts;
    };

    const recentOrders = validOrders.filter((o) => new Date(o.createdAt) >= sevenDaysAgo);
    let windowDays = 7;
    let quantityMap = aggregateQuantities(recentOrders);

    if (quantityMap.size === 0) {
      windowDays = null;
      quantityMap = aggregateQuantities(validOrders);
    }

    if (quantityMap.size === 0) {
      return { products: [], windowDays: null };
    }

    const rankedIds = Array.from(quantityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([productId]) => productId);

    const activeProducts = await prisma.product.findMany({
      where: {
        id: { in: rankedIds },
        isDeleted: false,
        isActive: true,
        stock: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        imageUrl: true,
        images: true,
        createdAt: true,
        category: { select: { id: true, name: true } },
      },
    });

    const productById = new Map(activeProducts.map((p) => [p.id, p]));
    const sortedProducts = rankedIds
      .map((id) => productById.get(id))
      .filter(Boolean)
      .slice(0, limit);

    return {
      products: sortedProducts,
      windowDays: sortedProducts.length > 0 ? windowDays : null,
    };
  }
}

module.exports = new ProductsService();
