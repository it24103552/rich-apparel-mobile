const prisma = require("../../config/prisma");

const SAFE_LOYALTY_USER_SELECT = {
  id: true,
  name: true,
  email: true,
};

class LoyaltyService {
  async addPoints(data) {
    const tx = await prisma.loyaltyTransaction.create({
      data,
      include: { user: { select: SAFE_LOYALTY_USER_SELECT } },
    });
    const notificationsService = require("../notifications/notifications.service");
    await notificationsService.create({
      type: "LOYALTY",
      title: "Points Awarded",
      message: `${tx.points} points were awarded to ${tx.user.name}.`,
      link: `/admin/loyalty`,
    }).catch(console.error);
    return tx;
  }

  async getBalance(userId) {
    const sum = await prisma.loyaltyTransaction.aggregate({
      where: { userId },
      _sum: { points: true },
    });
    return sum._sum.points || 0;
  }

  async getHistory(userId, skip = 0, take = 10) {
    return prisma.loyaltyTransaction.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async getAll(skip = 0, take = 10) {
    return prisma.loyaltyTransaction.findMany({
      include: { user: { select: SAFE_LOYALTY_USER_SELECT } },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id, data) {
    return prisma.loyaltyTransaction.update({
      where: { id },
      data,
      include: { user: { select: SAFE_LOYALTY_USER_SELECT } },
    });
  }

  async delete(id) {
    return prisma.loyaltyTransaction.delete({ where: { id } });
  }

  async redeemPoints(userId, points, orderId) {
    const balance = await this.getBalance(userId);
    if (balance < points) {
      throw new Error("Insufficient points");
    }

    const tx = await prisma.loyaltyTransaction.create({
      data: {
        userId,
        points: -points,
        type: "redeemed",
        orderId,
      },
      include: { user: { select: SAFE_LOYALTY_USER_SELECT } },
    });

    const notificationsService = require("../notifications/notifications.service");
    await notificationsService.create({
      type: "LOYALTY",
      title: "Points Redeemed",
      message: `${points} points were redeemed by ${tx.user.name}.`,
      link: `/admin/loyalty`,
    }).catch(console.error);

    return tx;
  }
}

module.exports = new LoyaltyService();
