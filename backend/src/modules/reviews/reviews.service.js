const prisma = require("../../config/prisma");

const PUBLIC_REVIEWER_SELECT = {
  id: true,
  name: true,
};

const REVIEW_PRODUCT_SELECT = {
  id: true,
  name: true,
  imageUrl: true,
  images: true,
  price: true,
};

class ReviewsService {
  async create(data, imageUrl) {
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product || product.isDeleted) {
      throw new Error("Product not found");
    }

    const review = await prisma.review.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        rating: data.rating,
        comment: data.comment,
        imageUrl,
      },
      include: {
        user: { select: PUBLIC_REVIEWER_SELECT },
        product: { select: REVIEW_PRODUCT_SELECT },
      },
    });

    const notificationsService = require("../notifications/notifications.service");
    await notificationsService.create({
      type: "REVIEW",
      title: "New Review",
      message: `${review.user.name} reviewed ${review.product.name} (${review.rating} stars).`,
      link: `/admin/reviews`,
    }).catch(console.error);

    return review;
  }

  async getAll(skip = 0, take = 10, productId = null) {
    const where = { isDeleted: false };
    if (productId) where.productId = productId;

    return prisma.review.findMany({
      where,
      include: {
        user: { select: PUBLIC_REVIEWER_SELECT },
        product: { select: REVIEW_PRODUCT_SELECT },
      },
      skip,
      take,
    });
  }

  async getById(id) {
    return prisma.review.findUnique({
      where: { id },
      include: {
        user: { select: PUBLIC_REVIEWER_SELECT },
        product: { select: REVIEW_PRODUCT_SELECT },
      },
    });
  }

  async getByUser(userId, skip = 0, take = 10) {
    return prisma.review.findMany({
      where: { userId, isDeleted: false },
      include: {
        user: { select: PUBLIC_REVIEWER_SELECT },
        product: { select: REVIEW_PRODUCT_SELECT },
      },
      skip,
      take,
    });
  }

  async update(id, userId, data, imageUrl) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review || review.isDeleted) throw new Error("Review not found");
    if (review.userId !== userId) throw new Error("Unauthorized: Review does not belong to this user");

    const updateData = {};
    if (data.rating !== undefined) updateData.rating = data.rating;
    if (data.comment !== undefined) updateData.comment = data.comment;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    return prisma.review.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: PUBLIC_REVIEWER_SELECT },
        product: { select: REVIEW_PRODUCT_SELECT },
      },
    });
  }

  async delete(id, userId, isAdmin = false) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review || review.isDeleted) throw new Error("Review not found");
    if (!isAdmin && review.userId !== userId) {
      throw new Error("Unauthorized: Review does not belong to this user");
    }

    return prisma.review.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async getTotalCount(productId = null) {
    const where = { isDeleted: false };
    if (productId) where.productId = productId;
    return prisma.review.count({ where });
  }
}

module.exports = new ReviewsService();
