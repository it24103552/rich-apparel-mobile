const prisma = require("../../config/prisma");
const loyaltyService = require("../loyalty/loyalty.service");
const { calculateEarnedPoints } = require("../../utils/pricing");

const INITIAL_STATUS_BY_METHOD = {
  cash_on_delivery: "pending",
  bank_deposit: "pending_verification",
};

class PaymentsService {
  async verifyPaymentEligibility({ orderId, userId, isAdmin = false }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order || order.isDeleted) {
      const err = new Error("Order not found");
      err.status = 404;
      err.errorCode = "ORDER_NOT_FOUND";
      throw err;
    }

    if (!isAdmin && order.userId !== userId) {
      const err = new Error("Forbidden - You can only create payments for your own orders");
      err.status = 403;
      err.errorCode = "FORBIDDEN";
      throw err;
    }

    if (order.status === "cancelled") {
      const err = new Error("Cannot submit payment for a cancelled order");
      err.status = 400;
      err.errorCode = "ORDER_CANCELLED";
      throw err;
    }

    if (order.payment) {
      const err = new Error("A payment record already exists for this order");
      err.status = 409;
      err.errorCode = "PAYMENT_ALREADY_EXISTS";
      throw err;
    }

    return order;
  }

  async create({ orderId, method, proofImageUrl = null, userId, isAdmin = false }) {
    const initialStatus = INITIAL_STATUS_BY_METHOD[method];
    if (!initialStatus) {
      const err = new Error("Unsupported payment method. Only cash_on_delivery and bank_deposit are supported.");
      err.status = 400;
      err.errorCode = "PAYMENT_METHOD_UNSUPPORTED";
      throw err;
    }

    const order = await this.verifyPaymentEligibility({ orderId, userId, isAdmin });

    // Server-authoritative payment amount and status (never client-controlled)
    const authoritativeAmount = order.total;

    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: authoritativeAmount,
          method,
          proofImageUrl,
          status: initialStatus,
        },
        include: {
          order: {
            include: { orderDiscount: true },
          },
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { method },
      });

      return payment;
    });
  }

  async getAll(skip = 0, take = 10) {
    return prisma.payment.findMany({
      include: { order: { include: { orderDiscount: true } } },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id) {
    return prisma.payment.findUnique({
      where: { id },
      include: { order: { include: { orderDiscount: true } } },
    });
  }

  async updateStatus(id, status) {
    const existing = await prisma.payment.findUnique({
      where: { id },
      include: { order: { include: { orderDiscount: true } } },
    });

    if (!existing) {
      const err = new Error("Payment not found");
      err.status = 404;
      err.errorCode = "NOT_FOUND";
      throw err;
    }

    const wasOrderPending = existing.order?.status === "pending";

    const updatedPayment = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id },
        data: { status },
        include: { order: { include: { orderDiscount: true } } },
      });

      // When payment is verified/marked as paid by an admin, confirm a pending order
      if (status === "paid" && payment.orderId && wasOrderPending) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: "confirmed" },
        });
      }

      return payment;
    });

    // Award loyalty points once when transitioning from pending -> confirmed via payment approval
    if (status === "paid" && wasOrderPending && updatedPayment.order) {
      const alreadyAwarded = await prisma.loyaltyTransaction.findFirst({
        where: {
          userId: updatedPayment.order.userId,
          orderId: updatedPayment.order.id,
          type: "earned",
        },
      });

      if (!alreadyAwarded) {
        const earnedPoints =
          updatedPayment.order.orderDiscount?.earnedPoints ??
          calculateEarnedPoints(updatedPayment.order.total);
        if (earnedPoints > 0) {
          await loyaltyService.addPoints({
            userId: updatedPayment.order.userId,
            points: earnedPoints,
            type: "earned",
            orderId: updatedPayment.order.id,
          }).catch(console.error);
        }
      }
    }

    return updatedPayment;
  }

  async getTotalCount() {
    return prisma.payment.count();
  }
}

module.exports = new PaymentsService();
module.exports.INITIAL_STATUS_BY_METHOD = INITIAL_STATUS_BY_METHOD;
