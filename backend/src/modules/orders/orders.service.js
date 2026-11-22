const prisma = require("../../config/prisma");
const { sendEmail } = require("../../config/mailer");
const loyaltyService = require("../loyalty/loyalty.service");
const { isVariantMatch } = require("../../utils/variantMatcher");
const { toAbsoluteMediaUrl } = require("../../utils/media");
const {
  FREE_SHIPPING_THRESHOLD,
  roundCurrency,
  calculateShippingFee,
  validateAndPriceItems,
  validateAndCalculateCoupon,
  calculateLoyaltyRedemption,
  calculateEarnedPoints,
} = require("../../utils/pricing");

const SAFE_ORDER_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
};

const ORDER_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  price: true,
  stock: true,
  imageUrl: true,
  images: true,
  categoryId: true,
};

const VALID_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

class OrdersService {
  /**
   * Read-only authoritative checkout quote calculation for React Web and Flutter Mobile.
   */
  async calculateQuote(userId, { items, deliveryMethod = "standard_delivery", couponCode = "", pointsUsed = 0 }) {
    const { pricedItems, subtotal } = await validateAndPriceItems(prisma, items);
    const shippingFee = calculateShippingFee(deliveryMethod, subtotal);

    const { coupon, couponDiscount } = await validateAndCalculateCoupon(prisma, {
      userId,
      couponCode,
      pricedItems,
      subtotal,
    });

    const maxRedeemable = Math.max(0, subtotal + shippingFee - couponDiscount);
    const { pointsUsed: appliedPoints, pointsValue } = await calculateLoyaltyRedemption(loyaltyService, {
      userId,
      pointsUsed,
      maxDiscountableAmount: maxRedeemable,
    });

    const finalTotal = roundCurrency(
      Math.max(0, subtotal + shippingFee - couponDiscount - pointsValue)
    );
    const earnedPoints = calculateEarnedPoints(finalTotal);

    return {
      currency: "LKR",
      items: pricedItems.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.price,
        lineTotal: i.lineTotal,
        variantAttributes: i.variantAttributes,
      })),
      subtotal,
      deliveryMethod,
      shippingFee,
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      couponCode: coupon?.code || null,
      couponDiscount,
      pointsUsed: appliedPoints,
      pointsValue,
      total: finalTotal,
      earnedPoints,
    };
  }

  /**
   * Authoritative server-side order creation.
   * All product prices, stock availability, shipping fees, coupon discounts,
   * loyalty point redemptions, and final totals are computed strictly from DB records.
   */
  async create(
    userId,
    items,
    address,
    contactNumber,
    contactEmail,
    deliveryMethod,
    couponCode = "",
    pointsUsed = 0
  ) {
    if (!contactNumber || !/^\d{10}$/.test(contactNumber)) {
      const err = new Error("Invalid phone number. Must be exactly 10 digits (e.g., 0771234567)");
      err.status = 400;
      err.errorCode = "INVALID_PHONE";
      throw err;
    }
    if (!address || address.trim().length < 10) {
      const err = new Error("Address is too short. Please provide a full shipping address (min 10 chars)");
      err.status = 400;
      err.errorCode = "INVALID_ADDRESS";
      throw err;
    }

    // 1. Authoritatively validate products, variants, stock, and compute item prices & subtotal
    const { pricedItems, subtotal } = await validateAndPriceItems(prisma, items);

    // 2. Authoritative shipping fee calculation
    const shippingFee = calculateShippingFee(deliveryMethod, subtotal);

    // 3. Authoritative coupon validation & discount
    const { coupon, couponDiscount } = await validateAndCalculateCoupon(prisma, {
      userId,
      couponCode,
      pricedItems,
      subtotal,
    });

    // 4. Authoritative loyalty redemption validation
    const maxRedeemable = Math.max(0, subtotal + shippingFee - couponDiscount);
    const { pointsUsed: appliedPoints, pointsValue } = await calculateLoyaltyRedemption(loyaltyService, {
      userId,
      pointsUsed,
      maxDiscountableAmount: maxRedeemable,
    });

    // 5. Authoritative grand total
    const finalTotal = roundCurrency(
      Math.max(0, subtotal + shippingFee - couponDiscount - pointsValue)
    );

    // 6. Atomically reserve / deduct stock BEFORE persisting the order, with rollback on failure
    const deductedItems = [];
    const notificationsService = require("../notifications/notifications.service");
    const activitiesService = require("../activities/activities.service");

    try {
      for (const item of pricedItems) {
        await this.#deductStockForItem(item, notificationsService, activitiesService);
        deductedItems.push(item);
      }

      // 7. Persist Order with authoritative prices, shippingFee, and finalTotal
      const orderItemsPayload = pricedItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price, // Strictly authoritative DB price
        variantAttributes: item.variantAttributes || undefined,
      }));

      const order = await prisma.order.create({
        data: {
          userId,
          status: "pending",
          total: finalTotal,
          shippingFee,
          address: address.trim(),
          contactNumber: contactNumber.trim(),
          contactEmail: contactEmail.trim(),
          deliveryMethod,
          method: "pending",
          items: { createMany: { data: orderItemsPayload } },
        },
        include: {
          items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        },
      });

      // 8. Deduct loyalty points if redeemed
      if (appliedPoints > 0) {
        await loyaltyService.redeemPoints(userId, appliedPoints, order.id);
      }

      // 9. Create OrderDiscount record
      const earnedPoints = calculateEarnedPoints(finalTotal);
      await prisma.orderDiscount.create({
        data: {
          orderId: order.id,
          couponId: coupon?.id,
          couponCode: coupon?.code,
          couponDiscount,
          pointsUsed: appliedPoints,
          pointsValue,
          earnedPoints,
        },
      });

      // 10. Clear user's cart items after successful order creation
      await prisma.cartItem.deleteMany({
        where: { cart: { userId } },
      });

      // 11. Fetch full order with safe user projection
      const fullOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
          payment: true,
          orderDiscount: true,
          user: { select: SAFE_ORDER_USER_SELECT },
        },
      });

      this.#sendOrderStatusEmail(fullOrder).catch(console.error);

      await notificationsService
        .create({
          type: "NEW_ORDER",
          title: "New Order Placed",
          message: `Order #${fullOrder.id.slice(-8).toUpperCase()} has been placed by ${fullOrder.user?.name || "Customer"}.`,
          link: `/admin/orders?viewId=${fullOrder.id}`,
        })
        .catch(console.error);

      return fullOrder;
    } catch (error) {
      // Rollback any stock already deducted if a subsequent item or DB write failed
      if (deductedItems.length > 0) {
        await this.#restoreStock(deductedItems).catch((rbErr) => {
          console.error("[OrdersService] Failed to rollback stock:", rbErr.message);
        });
      }
      throw error;
    }
  }

  async #deductStockForItem(item, notificationsService, activitiesService) {
    if (!item.hasVariants) {
      // Atomic conditional decrement to prevent negative-stock race conditions
      const updateResult = await prisma.product.updateMany({
        where: {
          id: item.productId,
          isDeleted: false,
          isActive: { not: false },
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
        },
      });

      if (updateResult.count === 0) {
        const err = new Error(`Insufficient stock for "${item.productName}"`);
        err.status = 400;
        err.errorCode = "INSUFFICIENT_STOCK";
        throw err;
      }

      const updatedProduct = await prisma.product.findUnique({ where: { id: item.productId } });
      if (updatedProduct) {
        if (updatedProduct.stock <= 10) {
          await notificationsService.checkLowStock(updatedProduct).catch(console.error);
        }
        await activitiesService
          .log({
            type: "ACTION",
            action: "UPDATE_PRODUCT",
            targetId: updatedProduct.id,
            targetName: updatedProduct.name,
            message: `Stock automatically updated after purchase. New total: ${updatedProduct.stock}`,
            details: { newStock: updatedProduct.stock },
          })
          .catch(console.error);
      }
      return;
    }

    // Variant product: re-read fresh product, verify variant stock >= qty, and update
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || product.isDeleted || product.isActive === false) {
      const err = new Error(`Product "${item.productName}" is no longer available`);
      err.status = 400;
      err.errorCode = "PRODUCT_UNAVAILABLE";
      throw err;
    }

    let variantMatched = false;
    const updatedVariants = product.variants.map((v) => {
      if (variantMatched) return v;
      const vAttrs = v.attributes || v;
      const matchResult = item.matchedVariantId
        ? v.id === item.matchedVariantId
        : item.variantAttributes?.id
          ? v.id === item.variantAttributes.id
          : isVariantMatch(vAttrs, item.variantAttributes);

      if (matchResult) {
        variantMatched = true;
        const currentStock = parseInt(v.stock, 10) || 0;
        if (currentStock < item.quantity) {
          const err = new Error(
            `Insufficient stock for "${product.name}". Available: ${currentStock}, requested: ${item.quantity}`
          );
          err.status = 400;
          err.errorCode = "INSUFFICIENT_STOCK";
          throw err;
        }
        return { ...v, stock: currentStock - item.quantity };
      }
      return v;
    });

    if (!variantMatched) {
      const err = new Error(`Selected variant is unavailable for "${product.name}"`);
      err.status = 400;
      err.errorCode = "INVALID_VARIANT";
      throw err;
    }

    const newTotalStock = updatedVariants.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);

    const updatedProduct = await prisma.product.update({
      where: { id: product.id },
      data: {
        variants: updatedVariants,
        stock: newTotalStock,
      },
    });

    if (newTotalStock <= 10) {
      await notificationsService.checkLowStock(updatedProduct).catch(console.error);
    }
    await activitiesService
      .log({
        type: "ACTION",
        action: "UPDATE_PRODUCT",
        targetId: product.id,
        targetName: product.name,
        message: `Stock automatically updated after purchase. New total: ${newTotalStock}`,
        details: { newStock: newTotalStock },
      })
      .catch(console.error);
  }

  async createReturnOrder({ userId, items, address, contactNumber, contactEmail, returnRequestId, notes }) {
    if (!contactNumber || contactNumber.length < 7) {
      throw new Error("Invalid contact number for replacement order");
    }
    if (!address || address.trim().length < 5) {
      throw new Error("Address is required for replacement order");
    }
    if (!items || items.length === 0) {
      throw new Error("At least one item is required");
    }

    try {
      const originalReturn = await prisma.return.findUnique({
        where: { id: returnRequestId },
        include: { items: true },
      });

      if (!originalReturn) {
        throw new Error("Original return record not found for validation.");
      }

      for (const item of items) {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product || product.isDeleted) throw new Error(`Product ${item.productId} not found`);

        let newPrice = product.price;
        if (item.variantAttributes?.id && Array.isArray(product.variants)) {
          const variant = product.variants.find((v) => v.id === item.variantAttributes.id);
          if (variant && typeof variant.price === "number") newPrice = variant.price;
          else if (variant && variant.priceAdj) newPrice = product.price + (Number(variant.priceAdj) || 0);
        }

        const maxAllowed = Math.max(...originalReturn.items.map((i) => i.price || 0));
        if (maxAllowed > 0 && newPrice > maxAllowed) {
          throw new Error(`Price Violation: Replacement item (${newPrice} LKR) exceeds original credit (${maxAllowed} LKR)`);
        }
      }

      const order = await prisma.order.create({
        data: {
          userId,
          status: "confirmed",
          total: 0,
          shippingFee: 0,
          address,
          contactNumber,
          contactEmail,
          deliveryMethod: "standard_delivery",
          method: "return_replacement",
          items: {
            createMany: {
              data: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: 0,
                variantAttributes: item.variantAttributes || {},
              })),
            },
          },
        },
        include: {
          items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
          user: { select: SAFE_ORDER_USER_SELECT },
        },
      });

      for (const item of items) {
        try {
          const product = await prisma.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
            let variantMatched = false;
            const updatedVariants = product.variants.map((v) => {
              const matchResult = isVariantMatch(v.attributes || v, item.variantAttributes);
              if (matchResult && !variantMatched) {
                variantMatched = true;
                return { ...v, stock: Math.max(0, (parseInt(v.stock, 10) || 0) - item.quantity) };
              }
              return v;
            });

            const newTotalStock = updatedVariants.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            await prisma.product.update({
              where: { id: product.id },
              data: { variants: updatedVariants, stock: newTotalStock },
            });
          } else {
            await prisma.product.update({
              where: { id: product.id },
              data: { stock: Math.max(0, (product.stock || 0) - item.quantity) },
            });
          }
        } catch (stockError) {
          console.error(`[ReturnReplacement] Failed to update stock for ${item.productId}:`, stockError.message);
        }
      }

      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: 0,
          method: "return_replacement",
          status: "paid",
        },
      });

      await prisma.orderDiscount.create({
        data: {
          orderId: order.id,
          couponDiscount: 0,
          pointsUsed: 0,
          pointsValue: 0,
          earnedPoints: 0,
        },
      });

      const fullOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
          payment: true,
          orderDiscount: true,
          user: { select: SAFE_ORDER_USER_SELECT },
        },
      });

      this.#sendOrderStatusEmail(fullOrder).catch((err) =>
        console.error("[ReturnReplacement] Email failed:", err.message)
      );

      return fullOrder;
    } catch (error) {
      if (error.message?.includes("Inconsistent column data") || error.message?.includes("ObjectId")) {
        throw new Error("Invalid customer identifying data in the return request.");
      }
      throw error;
    }
  }

  async getAll(userId, skip = 0, take = 10, isAdmin = false) {
    const where = isAdmin ? { isDeleted: false } : { userId, isDeleted: false };
    return prisma.order.findMany({
      where,
      include: {
        user: { select: SAFE_ORDER_USER_SELECT },
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        orderDiscount: true,
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: SAFE_ORDER_USER_SELECT },
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        returns: true,
        orderDiscount: true,
      },
    });
  }

  async updateStatus(id, status) {
    const existingOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        orderDiscount: true,
        payment: true,
      },
    });
    if (!existingOrder || existingOrder.isDeleted) {
      const err = new Error("Order not found");
      err.status = 404;
      err.errorCode = "ORDER_NOT_FOUND";
      throw err;
    }

    if (existingOrder.status !== status) {
      const allowedNext = VALID_STATUS_TRANSITIONS[existingOrder.status] || [];
      if (!allowedNext.includes(status)) {
        const err = new Error(
          `Invalid order status transition from '${existingOrder.status}' to '${status}'`
        );
        err.status = 400;
        err.errorCode = "INVALID_STATUS_TRANSITION";
        throw err;
      }
    }

    if (status === "cancelled" && existingOrder.status !== "cancelled") {
      await this.#restoreStock(existingOrder.items);

      if (existingOrder.orderDiscount?.pointsUsed > 0) {
        await loyaltyService.addPoints({
          userId: existingOrder.userId,
          points: existingOrder.orderDiscount.pointsUsed,
          type: "refunded",
          orderId: existingOrder.id,
        });
      }
    }

    const updateData = { status };
    if (status === "delivered" && existingOrder.status !== "delivered") {
      updateData.deliveredAt = new Date();
    }

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        orderDiscount: true,
        user: { select: SAFE_ORDER_USER_SELECT },
      },
    });

    // Award loyalty points once when order is confirmed
    if (status === "confirmed" && existingOrder.status !== "confirmed") {
      const alreadyAwarded = await prisma.loyaltyTransaction.findFirst({
        where: { userId: order.userId, orderId: order.id, type: "earned" },
      });
      if (!alreadyAwarded) {
        const earnedPoints = order.orderDiscount?.earnedPoints || calculateEarnedPoints(order.total);
        if (earnedPoints > 0) {
          await loyaltyService.addPoints({
            userId: order.userId,
            points: earnedPoints,
            type: "earned",
            orderId: order.id,
          });
        }
      }
    }

    this.#sendOrderStatusEmail(order).catch(console.error);

    return order;
  }

  async delete(id) {
    return prisma.order.update({ where: { id }, data: { isDeleted: true } });
  }

  async getTotalCount(userId = null, isAdmin = true) {
    const where = isAdmin || !userId ? { isDeleted: false } : { userId, isDeleted: false };
    return prisma.order.count({ where });
  }

  async updateByUser(id, userId, data) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, orderDiscount: true, payment: true },
    });
    if (!order || order.isDeleted) {
      const err = new Error("Order not found");
      err.status = 404;
      err.errorCode = "ORDER_NOT_FOUND";
      throw err;
    }
    if (order.userId !== userId) {
      const err = new Error("Unauthorized: Order does not belong to this user");
      err.status = 403;
      err.errorCode = "FORBIDDEN";
      throw err;
    }
    if (order.status !== "pending") throw new Error("Can only edit pending orders");
    if (order.isUpdatedByUser) throw new Error("Delivery details can only be updated once");

    if (data.contactNumber && !/^\d{10}$/.test(data.contactNumber)) {
      throw new Error("Invalid phone number. Must be 10 digits.");
    }
    if (data.address && data.address.trim().length < 10) {
      throw new Error("Address is too short. Please provide at least 10 characters.");
    }

    const updateData = {
      isUpdatedByUser: true,
    };
    if (data.address !== undefined) updateData.address = data.address.trim();
    if (data.contactNumber !== undefined) updateData.contactNumber = data.contactNumber.trim();
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail.trim();

    // If deliveryMethod changes, recalculate shipping fee and total server-side
    if (data.deliveryMethod !== undefined && data.deliveryMethod !== order.deliveryMethod) {
      if (order.payment && order.payment.status === "paid") {
        throw new Error("Cannot change delivery method after payment has been completed");
      }
      const subtotal = roundCurrency(
        order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      );
      const newShippingFee = calculateShippingFee(data.deliveryMethod, subtotal);
      const couponDiscount = order.orderDiscount?.couponDiscount || 0;
      const pointsValue = order.orderDiscount?.pointsValue || 0;
      const newTotal = roundCurrency(
        Math.max(0, subtotal + newShippingFee - couponDiscount - pointsValue)
      );

      updateData.deliveryMethod = data.deliveryMethod;
      updateData.shippingFee = newShippingFee;
      updateData.total = newTotal;

      if (order.payment && ["pending", "pending_verification"].includes(order.payment.status)) {
        updateData.payment = { update: { amount: newTotal } };
      }
    }

    return prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        orderDiscount: true,
      },
    });
  }

  async #restoreStock(orderItems) {
    for (const item of orderItems) {
      const productId = item.productId || item.product?.id;
      if (!productId) continue;

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) continue;

      if (
        item.variantAttributes &&
        Object.keys(item.variantAttributes).length > 0 &&
        Array.isArray(product.variants) &&
        product.variants.length > 0
      ) {
        let variantMatched = false;
        const updatedVariants = product.variants.map((v) => {
          if (variantMatched) return v;
          const vAttrs = v.attributes || v;
          const matchResult = item.matchedVariantId
            ? v.id === item.matchedVariantId
            : item.variantAttributes?.id
              ? v.id === item.variantAttributes.id
              : isVariantMatch(vAttrs, item.variantAttributes);

          if (matchResult) {
            variantMatched = true;
            const currentStock = parseInt(v.stock, 10) || 0;
            return { ...v, stock: currentStock + parseInt(item.quantity, 10) };
          }
          return v;
        });

        const newTotalStock = updatedVariants.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);

        await prisma.product.update({
          where: { id: product.id },
          data: { variants: updatedVariants, stock: newTotalStock },
        });
      } else {
        const newTotalStock = (product.stock || 0) + parseInt(item.quantity, 10);
        await prisma.product.update({
          where: { id: product.id },
          data: { stock: newTotalStock },
        });
      }
    }
  }

  async cancelByUser(id, userId) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        orderDiscount: true,
      },
    });
    if (!order || order.isDeleted) {
      const err = new Error("Order not found");
      err.status = 404;
      err.errorCode = "ORDER_NOT_FOUND";
      throw err;
    }
    if (order.userId !== userId) {
      const err = new Error("Unauthorized: Order does not belong to this user");
      err.status = 403;
      err.errorCode = "FORBIDDEN";
      throw err;
    }
    if (order.status !== "pending") throw new Error("Can only cancel pending orders");

    let paymentUpdate = {};
    if (order.payment) {
      if (["card", "bank_deposit"].includes(order.payment.method) && order.payment.status === "paid") {
        paymentUpdate = { update: { status: "refund_pending" } };
      } else if (order.payment.method === "bank_deposit") {
        paymentUpdate = { update: { status: "refund_pending" } };
      } else {
        paymentUpdate = { update: { status: "cancelled" } };
      }
    }

    await this.#restoreStock(order.items);

    if (order.orderDiscount?.pointsUsed > 0) {
      await loyaltyService.addPoints({
        userId: order.userId,
        points: order.orderDiscount.pointsUsed,
        type: "refunded",
        orderId: order.id,
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: "cancelled",
        ...(Object.keys(paymentUpdate).length > 0 && { payment: paymentUpdate }),
      },
      include: {
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        orderDiscount: true,
        user: { select: SAFE_ORDER_USER_SELECT },
      },
    });

    this.#sendOrderStatusEmail(updatedOrder).catch(console.error);

    return updatedOrder;
  }

  async processRefund(id) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: SAFE_ORDER_USER_SELECT },
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        orderDiscount: true,
      },
    });
    if (!order || order.isDeleted) throw new Error("Order not found");
    if (order.status !== "cancelled") throw new Error("Only cancelled orders can be refunded");
    if (!order.payment) throw new Error("No payment found for this order");
    if (order.payment.status !== "refund_pending") throw new Error("Payment is not eligible for refund");

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        payment: {
          update: { status: "refunded" },
        },
      },
      include: {
        user: { select: SAFE_ORDER_USER_SELECT },
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
        orderDiscount: true,
      },
    });

    this.#sendOrderStatusEmail(updatedOrder, "refunded").catch(console.error);

    return updatedOrder;
  }

  async applyDiscount(userId, orderId, { couponCode, pointsUsed }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { select: ORDER_PRODUCT_SELECT } } } },
    });
    if (!order || order.isDeleted) {
      const err = new Error("Order not found");
      err.status = 404;
      err.errorCode = "ORDER_NOT_FOUND";
      throw err;
    }
    if (order.userId !== userId) {
      const err = new Error("Unauthorized");
      err.status = 403;
      err.errorCode = "FORBIDDEN";
      throw err;
    }

    const pricedItems = order.items.map((i) => ({
      productId: i.productId,
      categoryId: i.product?.categoryId,
      quantity: i.quantity,
      price: i.price,
    }));
    const subtotal = roundCurrency(
      pricedItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
    );
    const shippingFee = order.shippingFee ?? calculateShippingFee(order.deliveryMethod, subtotal);

    const { coupon, couponDiscount } = await validateAndCalculateCoupon(prisma, {
      userId,
      couponCode,
      pricedItems,
      subtotal,
      excludeOrderId: order.id,
    });

    const maxRedeemable = Math.max(0, subtotal + shippingFee - couponDiscount);
    const { pointsUsed: appliedPoints, pointsValue } = await calculateLoyaltyRedemption(loyaltyService, {
      userId,
      pointsUsed,
      maxDiscountableAmount: maxRedeemable,
    });

    const finalTotal = roundCurrency(
      Math.max(0, subtotal + shippingFee - couponDiscount - pointsValue)
    );

    return {
      couponCode: coupon?.code || null,
      couponDiscount,
      pointsUsed: appliedPoints,
      pointsValue,
      finalTotal,
      earnedPoints: calculateEarnedPoints(finalTotal),
    };
  }

  async saveDiscount(userId, orderId, { couponCode, pointsUsed }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: ORDER_PRODUCT_SELECT } } },
        payment: true,
      },
    });
    if (!order || order.isDeleted) {
      const err = new Error("Order not found");
      err.status = 404;
      err.errorCode = "ORDER_NOT_FOUND";
      throw err;
    }
    if (order.userId !== userId) {
      const err = new Error("Unauthorized");
      err.status = 403;
      err.errorCode = "FORBIDDEN";
      throw err;
    }
    if (order.status !== "pending" || order.payment) {
      throw new Error("Discounts can only be applied to pending unpaid orders");
    }

    const existingDiscount = await prisma.orderDiscount.findUnique({ where: { orderId } });
    if (existingDiscount && (existingDiscount.couponDiscount > 0 || existingDiscount.pointsUsed > 0)) {
      throw new Error("Discount already applied to this order");
    }

    const pricedItems = order.items.map((i) => ({
      productId: i.productId,
      categoryId: i.product?.categoryId,
      quantity: i.quantity,
      price: i.price,
    }));
    const subtotal = roundCurrency(
      pricedItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
    );
    const shippingFee = order.shippingFee ?? calculateShippingFee(order.deliveryMethod, subtotal);

    const { coupon, couponDiscount } = await validateAndCalculateCoupon(prisma, {
      userId,
      couponCode,
      pricedItems,
      subtotal,
      excludeOrderId: order.id,
    });

    const maxRedeemable = Math.max(0, subtotal + shippingFee - couponDiscount);
    const { pointsUsed: appliedPoints, pointsValue } = await calculateLoyaltyRedemption(loyaltyService, {
      userId,
      pointsUsed,
      maxDiscountableAmount: maxRedeemable,
    });

    const finalTotal = roundCurrency(
      Math.max(0, subtotal + shippingFee - couponDiscount - pointsValue)
    );

    await prisma.order.update({
      where: { id: orderId },
      data: { total: finalTotal, shippingFee },
    });

    if (appliedPoints > 0) {
      await loyaltyService.redeemPoints(userId, appliedPoints, orderId);
    }

    const earnedPoints = calculateEarnedPoints(finalTotal);
    await prisma.orderDiscount.upsert({
      where: { orderId },
      update: {
        couponId: coupon?.id,
        couponCode: coupon?.code,
        couponDiscount,
        pointsUsed: appliedPoints,
        pointsValue,
        earnedPoints,
      },
      create: {
        orderId,
        couponId: coupon?.id,
        couponCode: coupon?.code,
        couponDiscount,
        pointsUsed: appliedPoints,
        pointsValue,
        earnedPoints,
      },
    });

    return { orderId, finalTotal, couponDiscount, pointsValue, earnedPoints };
  }

  async getDiscountDetails(orderId) {
    return prisma.orderDiscount.findUnique({
      where: { orderId },
      include: { coupon: true },
    });
  }

  #getImageUrl(product) {
    if (!product) return null;
    const img = product.images?.[0] || product.imageUrl;
    if (!img) return null;
    return toAbsoluteMediaUrl(img);
  }

  #buildOrderEmailHtml(order, { title, subtitle, statusLabel, statusColor, footerMessage }) {
    const subtotal = order.items?.reduce((acc, i) => acc + i.price * i.quantity, 0) || 0;
    const shippingFee =
      order.method === "return_replacement"
        ? 0
        : order.shippingFee !== undefined && order.shippingFee !== null
          ? order.shippingFee
          : calculateShippingFee(order.deliveryMethod || "standard_delivery", subtotal);
    const discount = order.orderDiscount
      ? (order.orderDiscount.couponDiscount || 0) + (order.orderDiscount.pointsValue || 0)
      : Math.max(0, subtotal + shippingFee - (order.total || 0));
    // order.total is already the authoritative grand total (subtotal + shippingFee - discount)
    const grandTotal = order.total ?? Math.max(0, subtotal + shippingFee - discount);

    const paymentMethod = order.payment?.method?.replace(/_/g, " ") || order.method || "Pending";
    const paymentStatus = order.payment?.status || "unpaid";

    const itemsHtml = (order.items || [])
      .map((item) => {
        const imgUrl = this.#getImageUrl(item.product);
        const imgCell = imgUrl
          ? `<img src="${imgUrl}" alt="${item.product?.name || "Product"}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #e5e5e5;" />`
          : `<div style="width:56px;height:56px;background:#f5f5f5;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:20px;border:1px solid #e5e5e5;">📦</div>`;

        return `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:12px;vertical-align:middle;">${imgCell}</td>
              <td style="vertical-align:middle;">
                <p style="margin:0;font-weight:700;color:#111;font-size:13px;">${item.product?.name || "Product"}</p>
                ${item.variantAttributes ? `<p style="margin:2px 0 0;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">${Object.entries(item.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>` : ""}
              </td>
            </tr></table>
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:600;color:#333;font-size:13px;">${item.quantity}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#666;font-size:13px;">LKR ${item.price.toFixed(2)}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#111;font-size:13px;">LKR ${(item.price * item.quantity).toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const deliveryLabel =
      order.deliveryMethod === "express_delivery"
        ? "Express"
        : order.deliveryMethod === "pickup"
          ? "Self-Pickup"
          : "Standard";

    return `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f5f5;padding:0;">
      <div style="background:#111;padding:28px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:18px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">RICH APPAREL</h1>
      </div>

      <div style="padding:32px 28px;">
        <div style="background:${statusColor};border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <p style="margin:0;color:#fff;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:0.7;">${statusLabel}</p>
          <p style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">${title}</p>
        </div>

        <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 24px;">${subtitle}</p>

        <div style="background:#fff;border-radius:12px;border:1px solid #e8e8e8;padding:16px 20px;margin-bottom:24px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:4px 0;"><span style="font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Order ID</span></td>
              <td style="padding:4px 0;text-align:right;"><span style="font-size:13px;font-weight:800;color:#111;">#${order.id.slice(-8).toUpperCase()}</span></td>
            </tr>
            <tr>
              <td style="padding:4px 0;"><span style="font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Order Date</span></td>
              <td style="padding:4px 0;text-align:right;"><span style="font-size:13px;font-weight:600;color:#333;">${new Date(order.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span></td>
            </tr>
            <tr>
              <td style="padding:4px 0;"><span style="font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Payment</span></td>
              <td style="padding:4px 0;text-align:right;"><span style="font-size:13px;font-weight:600;color:#333;text-transform:capitalize;">${paymentMethod} (${paymentStatus})</span></td>
            </tr>
          </table>
        </div>

        <div style="background:#fff;border-radius:12px;border:1px solid #e8e8e8;overflow:hidden;margin-bottom:24px;">
          <div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;">
            <p style="margin:0;font-size:11px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:2px;">Order Items</p>
          </div>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <thead>
              <tr style="background:#fafafa;">
                <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Product</th>
                <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Qty</th>
                <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Price</th>
                <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        <div style="background:#fff;border-radius:12px;border:1px solid #e8e8e8;padding:20px;margin-bottom:24px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#666;">Subtotal</td>
              <td style="padding:6px 0;text-align:right;font-size:13px;font-weight:600;color:#333;">LKR ${subtotal.toFixed(2)}</td>
            </tr>
            ${discount > 0 ? `
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#10b981;">Discount</td>
              <td style="padding:6px 0;text-align:right;font-size:13px;font-weight:600;color:#10b981;">- LKR ${discount.toFixed(2)}</td>
            </tr>` : ""}
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#666;">Delivery (${deliveryLabel})</td>
              <td style="padding:6px 0;text-align:right;font-size:13px;font-weight:600;color:#333;">${shippingFee === 0 ? "FREE" : `LKR ${shippingFee.toFixed(2)}`}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:8px 0 0;"><div style="border-top:2px solid #111;"></div></td>
            </tr>
            <tr>
              <td style="padding:10px 0 0;font-size:16px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:1px;">Grand Total</td>
              <td style="padding:10px 0 0;text-align:right;font-size:18px;font-weight:900;color:#111;">LKR ${grandTotal.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div style="background:#111;border-radius:12px;padding:20px;margin-bottom:24px;color:#fff;">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.4);">Delivery Details</p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:4px 0;font-size:12px;color:rgba(255,255,255,0.5);font-weight:600;">Method</td>
              <td style="padding:4px 0;text-align:right;font-size:12px;font-weight:700;color:#fff;text-transform:capitalize;">${(order.deliveryMethod || "standard_delivery").replace(/_/g, " ")}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:rgba(255,255,255,0.5);font-weight:600;">Address</td>
              <td style="padding:4px 0;text-align:right;font-size:12px;font-weight:700;color:#fff;">${order.address}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:rgba(255,255,255,0.5);font-weight:600;">Contact</td>
              <td style="padding:4px 0;text-align:right;font-size:12px;font-weight:700;color:#fff;">${order.contactNumber}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:rgba(255,255,255,0.5);font-weight:600;">Email</td>
              <td style="padding:4px 0;text-align:right;font-size:12px;font-weight:700;color:#fff;">${order.contactEmail}</td>
            </tr>
          </table>
        </div>

        <p style="color:#999;font-size:12px;text-align:center;line-height:1.6;margin:0;">${footerMessage}</p>
      </div>

      <div style="background:#111;padding:16px 32px;text-align:center;">
        <p style="margin:0;color:rgba(255,255,255,0.3);font-size:10px;font-weight:600;letter-spacing:1px;">© ${new Date().getFullYear()} RICH APPAREL · ALL RIGHTS RESERVED</p>
      </div>
    </div>`;
  }

  async #sendOrderStatusEmail(order, customType = null) {
    const isReplacement = order.method === "return_replacement";

    const configs = {
      pending: {
        title: isReplacement ? "Replacement Received" : "Order Received",
        subtitle: isReplacement
          ? "We have received your request for a replacement and it is being reviewed. You will be notified once it is confirmed."
          : "We have received your order and it is being reviewed. You will be notified once it is confirmed.",
        statusLabel: "Status Update",
        statusColor: "#f59e0b",
        footerMessage: isReplacement
          ? "Your replacement order is being reviewed. We will update you shortly."
          : "Your order is being reviewed. We will update you shortly.",
      },
      confirmed: {
        title: isReplacement ? "Replacement Confirmed" : "Order Confirmed",
        subtitle: isReplacement
          ? "Great news! Your replacement has been confirmed and is now being prepared for shipment."
          : "Great news! Your order has been confirmed and is now being prepared for shipment.",
        statusLabel: "Confirmed",
        statusColor: "#2563eb",
        footerMessage: "We are preparing your items. You will receive a shipping notification soon.",
      },
      shipped: {
        title: isReplacement ? "Replacement On the Way" : "Order On the Way",
        subtitle: isReplacement
          ? "Your replacement items are on their way! They have been handed over to our delivery partner."
          : "Your order is on its way! It has been handed over to the delivery partner.",
        statusLabel: "On the Way",
        statusColor: "#7c3aed",
        footerMessage: "Your package is on its way. Track your order for live updates.",
      },
      delivered: {
        title: isReplacement ? "Replacement Delivered" : "Order Delivered",
        subtitle: isReplacement
          ? "Your replacement items have been successfully delivered. We hope they meet your expectations!"
          : "Your order has been successfully delivered. We hope you enjoy your purchase!",
        statusLabel: "Delivered",
        statusColor: "#10b981",
        footerMessage: "Thank you for shopping with Rich Apparel.",
      },
      cancelled: {
        title: isReplacement ? "Replacement Cancelled" : "Order Cancelled",
        subtitle: "The shipment has been cancelled. Please contact our support team for further assistance.",
        statusLabel: "Cancelled",
        statusColor: "#ef4444",
        footerMessage: "If you have any questions about this cancellation, please contact our support team.",
      },
      refunded: {
        title: "Payment Refunded",
        subtitle: "Your payment for the cancelled order has been fully refunded to your original payment method.",
        statusLabel: "Refunded",
        statusColor: "#8b5cf6",
        footerMessage: "Please allow 3-5 business days for the refund to appear on your statement.",
      },
    };

    const config = configs[customType || order.status] || configs.pending;
    const html = this.#buildOrderEmailHtml(order, config);
    const subjectMap = {
      pending: isReplacement ? "Replacement Received" : "Order Received",
      confirmed: isReplacement ? "Replacement Confirmed" : "Order Confirmed",
      shipped: isReplacement ? "Replacement Shipped" : "Order On the Way",
      delivered: isReplacement ? "Replacement Delivered" : "Order Delivered",
      cancelled: isReplacement ? "Replacement Cancelled" : "Order Cancelled",
      refunded: "Payment Refunded",
    };

    const typeKey = customType || order.status;
    const subjectPrefix = subjectMap[typeKey] || "Order Update";

    await sendEmail(
      order.contactEmail,
      `${isReplacement ? "REPLACEMENT: " : ""}${subjectPrefix} — #${order.id.slice(-8).toUpperCase()}`,
      `Your ${isReplacement ? "replacement " : ""}order #${order.id.slice(-8).toUpperCase()} status: ${order.status}. ${config.subtitle}`,
      html
    );
  }
}

module.exports = new OrdersService();
module.exports.VALID_STATUS_TRANSITIONS = VALID_STATUS_TRANSITIONS;
