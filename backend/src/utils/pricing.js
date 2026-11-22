const loyaltyConfig = require("../config/loyalty-config.json");
const { isVariantMatch } = require("./variantMatcher");

const FREE_SHIPPING_THRESHOLD = 10000; // LKR 10,000 for free Standard Delivery

const SHIPPING_METHODS = {
  standard_delivery: {
    id: "standard_delivery",
    label: "Standard Delivery (3-5 Days)",
    baseFee: 350,
    freeThreshold: FREE_SHIPPING_THRESHOLD,
  },
  express_delivery: {
    id: "express_delivery",
    label: "Express Delivery (Next Day)",
    baseFee: 500,
    freeThreshold: null,
  },
  pickup: {
    id: "pickup",
    label: "Self-Pickup",
    baseFee: 0,
    freeThreshold: 0,
  },
};

const roundCurrency = (amount) => {
  return Math.round((Number(amount) || 0) * 100) / 100;
};

/**
 * Single authoritative shipping fee calculation shared across checkout, quotes,
 * order updates, emails, and dashboard reporting.
 *
 * Rules:
 * - pickup: LKR 0 (always free)
 * - standard_delivery: LKR 0 when item subtotal >= LKR 10,000; otherwise LKR 350
 * - express_delivery: LKR 500 flat rate
 */
const calculateShippingFee = (deliveryMethod, subtotal = 0) => {
  const method = String(deliveryMethod || "standard_delivery").trim().toLowerCase();
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);

  if (method === "pickup") return 0;
  if (method === "express_delivery") return SHIPPING_METHODS.express_delivery.baseFee;
  if (method === "standard_delivery") {
    return safeSubtotal >= FREE_SHIPPING_THRESHOLD
      ? 0
      : SHIPPING_METHODS.standard_delivery.baseFee;
  }

  const err = new Error("Invalid delivery method");
  err.status = 400;
  err.errorCode = "INVALID_DELIVERY_METHOD";
  throw err;
};

const getShippingConfig = () => ({
  currency: "LKR",
  freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  methods: Object.values(SHIPPING_METHODS),
});

const findMatchingVariant = (product, variantAttributes) => {
  if (!product?.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
    return null;
  }

  return (
    product.variants.find((v) => {
      if (variantAttributes?.id) return v.id === variantAttributes.id;
      return isVariantMatch(v.attributes || v, variantAttributes);
    }) || null
  );
};

const resolveAuthoritativeUnitPrice = (product, matchingVariant = null) => {
  const basePrice = Number(product.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    const err = new Error(`Product "${product.name}" has an invalid price configuration`);
    err.status = 400;
    err.errorCode = "INVALID_PRODUCT_PRICE";
    throw err;
  }

  if (matchingVariant) {
    if (typeof matchingVariant.price === "number" && matchingVariant.price > 0) {
      return roundCurrency(matchingVariant.price);
    }
    const adj = Number(matchingVariant.priceAdj) || 0;
    const adjusted = roundCurrency(basePrice + adj);
    if (adjusted <= 0) {
      const err = new Error(`Variant for "${product.name}" has an invalid price configuration`);
      err.status = 400;
      err.errorCode = "INVALID_PRODUCT_PRICE";
      throw err;
    }
    return adjusted;
  }

  return roundCurrency(basePrice);
};

/**
 * Fetches all referenced products from MongoDB, validates product & category availability,
 * resolves variants, aggregates quantities across duplicate lines, checks stock,
 * and returns authoritative priced items (ignoring any client-supplied prices).
 */
const validateAndPriceItems = async (prisma, rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const err = new Error("Order must contain at least one item");
    err.status = 400;
    err.errorCode = "EMPTY_ORDER_ITEMS";
    throw err;
  }

  const uniqueProductIds = [...new Set(rawItems.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: uniqueProductIds } },
    include: {
      category: {
        select: { id: true, name: true, isActive: true, isDeleted: true },
      },
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));
  const aggregatedStockDemand = new Map();
  const pricedItems = [];

  for (const rawItem of rawItems) {
    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      const err = new Error("Item quantity must be a positive whole number");
      err.status = 400;
      err.errorCode = "INVALID_QUANTITY";
      throw err;
    }

    const product = productMap.get(rawItem.productId);
    if (!product || product.isDeleted) {
      const err = new Error(`Product not found or no longer available (${rawItem.productId})`);
      err.status = 400;
      err.errorCode = "PRODUCT_NOT_FOUND";
      throw err;
    }

    if (product.isActive === false) {
      const err = new Error(`Product "${product.name}" is currently unavailable`);
      err.status = 400;
      err.errorCode = "PRODUCT_UNAVAILABLE";
      throw err;
    }

    if (product.category && (product.category.isDeleted || product.category.isActive === false)) {
      const err = new Error(`Product "${product.name}" belongs to an unavailable category`);
      err.status = 400;
      err.errorCode = "PRODUCT_UNAVAILABLE";
      throw err;
    }

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    let matchingVariant = null;
    let stockKey = product.id;
    let availableStock = parseInt(product.stock, 10) || 0;

    if (hasVariants) {
      matchingVariant = findMatchingVariant(product, rawItem.variantAttributes);
      if (!matchingVariant) {
        const err = new Error(`Selected variant is unavailable for "${product.name}"`);
        err.status = 400;
        err.errorCode = "INVALID_VARIANT";
        throw err;
      }
      const variantIndex = product.variants.indexOf(matchingVariant);
      stockKey = `${product.id}::variant::${matchingVariant.id || variantIndex}`;
      availableStock = parseInt(matchingVariant.stock, 10) || 0;
    }

    const prevDemand = aggregatedStockDemand.get(stockKey)?.requested || 0;
    const totalDemand = prevDemand + quantity;
    aggregatedStockDemand.set(stockKey, {
      requested: totalDemand,
      available: availableStock,
      productName: product.name,
    });

    if (availableStock <= 0 || totalDemand > availableStock) {
      const err = new Error(
        `Insufficient stock for "${product.name}". Available: ${availableStock}, requested: ${totalDemand}`
      );
      err.status = 400;
      err.errorCode = "INSUFFICIENT_STOCK";
      throw err;
    }

    const unitPrice = resolveAuthoritativeUnitPrice(product, matchingVariant);

    pricedItems.push({
      productId: product.id,
      categoryId: product.categoryId,
      productName: product.name,
      quantity,
      price: unitPrice,
      lineTotal: roundCurrency(unitPrice * quantity),
      variantAttributes: rawItem.variantAttributes || null,
      matchedVariantId: matchingVariant?.id || null,
      hasVariants,
    });
  }

  const subtotal = roundCurrency(
    pricedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  );

  return { pricedItems, subtotal, productMap };
};

/**
 * Authoritatively validates a coupon code and calculates the discount amount
 * strictly against server-priced items.
 */
const validateAndCalculateCoupon = async (
  prisma,
  { userId = null, couponCode = "", pricedItems = [], subtotal = 0, excludeOrderId = null }
) => {
  const cleanCode = String(couponCode || "").trim();
  if (!cleanCode) {
    return { coupon: null, couponDiscount: 0, eligibleTotal: subtotal };
  }

  const coupon = await prisma.coupon.findFirst({
    where: { code: cleanCode, isDeleted: false },
  });

  if (!coupon) {
    const err = new Error("Invalid coupon code");
    err.status = 400;
    err.errorCode = "INVALID_COUPON";
    throw err;
  }

  if (subtotal < coupon.minCartValue) {
    const err = new Error(`Cart value must be at least LKR ${coupon.minCartValue}`);
    err.status = 400;
    err.errorCode = "COUPON_MIN_VALUE_NOT_MET";
    throw err;
  }

  if (userId) {
    const usedWhere = {
      couponId: coupon.id,
      order: {
        userId,
        isDeleted: false,
        status: { not: "cancelled" },
      },
    };
    if (excludeOrderId) {
      usedWhere.orderId = { not: excludeOrderId };
    }

    const usedCount = await prisma.orderDiscount.count({ where: usedWhere });
    if (usedCount > 0) {
      const err = new Error("You have already used this coupon code");
      err.status = 400;
      err.errorCode = "COUPON_ALREADY_USED";
      throw err;
    }
  }

  if (coupon.firstOrder || coupon.audienceType === "new") {
    if (!userId) {
      const err = new Error("Please sign in to use this first-order coupon");
      err.status = 400;
      err.errorCode = "COUPON_AUTH_REQUIRED";
      throw err;
    }

    const orderWhere = { userId, isDeleted: false, status: { not: "cancelled" } };
    if (excludeOrderId) {
      orderWhere.id = { not: excludeOrderId };
    }
    const userOrders = await prisma.order.count({ where: orderWhere });
    if (userOrders > 0) {
      const err = new Error(
        coupon.audienceType === "new"
          ? "This coupon is only for new customers with 0 orders"
          : "This coupon is only for first orders"
      );
      err.status = 400;
      err.errorCode = "COUPON_NOT_ELIGIBLE";
      throw err;
    }
  }

  if (coupon.audienceType === "specific") {
    if (!userId || !Array.isArray(coupon.audienceUserIds) || !coupon.audienceUserIds.includes(userId)) {
      const err = new Error("You are not eligible for this private promotion");
      err.status = 400;
      err.errorCode = "COUPON_NOT_ELIGIBLE";
      throw err;
    }
  }

  let eligibleTotal = 0;
  if (coupon.targetType === "category" || coupon.targetType === "product") {
    const targetCategoryIds = (coupon.targetCategoryIds || []).map(String);
    const targetProductIds = (coupon.targetProductIds || []).map(String);

    for (const item of pricedItems) {
      let isEligible = false;
      if (coupon.targetType === "category" && item.categoryId && targetCategoryIds.includes(String(item.categoryId))) {
        isEligible = true;
      } else if (coupon.targetType === "product" && targetProductIds.includes(String(item.productId))) {
        isEligible = true;
      }

      if (isEligible) {
        eligibleTotal += roundCurrency(item.price * item.quantity);
      }
    }

    if (eligibleTotal <= 0) {
      const err = new Error("Coupon is not valid for any items in your cart");
      err.status = 400;
      err.errorCode = "COUPON_NO_ELIGIBLE_ITEMS";
      throw err;
    }
  } else {
    eligibleTotal = subtotal;
  }

  let couponDiscount = 0;
  if (coupon.discountType === "percentage") {
    const pct = Math.min(Math.max(Number(coupon.discount) || 0, 0), 100);
    couponDiscount = roundCurrency((eligibleTotal * pct) / 100);
  } else {
    couponDiscount = roundCurrency(Math.min(Math.max(Number(coupon.discount) || 0, 0), eligibleTotal));
  }

  return { coupon, couponDiscount, eligibleTotal: roundCurrency(eligibleTotal) };
};

const calculateLoyaltyRedemption = async (loyaltyService, { userId, pointsUsed = 0, maxDiscountableAmount = 0 }) => {
  const requestedPoints = parseInt(pointsUsed, 10) || 0;
  if (requestedPoints < 0) {
    const err = new Error("Loyalty points used cannot be negative");
    err.status = 400;
    err.errorCode = "INVALID_POINTS";
    throw err;
  }

  if (requestedPoints === 0) {
    return { pointsUsed: 0, pointsValue: 0 };
  }

  const userBalance = await loyaltyService.getBalance(userId);
  if (userBalance < requestedPoints) {
    const err = new Error("Insufficient loyalty points balance");
    err.status = 400;
    err.errorCode = "INSUFFICIENT_POINTS";
    throw err;
  }

  const redeemValue = Number(loyaltyConfig.redeemValue) || 1;
  const maxPointsForAmount = Math.floor(Math.max(0, maxDiscountableAmount) / redeemValue);
  const appliedPoints = Math.min(requestedPoints, maxPointsForAmount);
  const pointsValue = roundCurrency(appliedPoints * redeemValue);

  return { pointsUsed: appliedPoints, pointsValue };
};

const calculateEarnedPoints = (finalTotal) => {
  const earnRate = Number(loyaltyConfig.earnRate) || 100;
  return Math.floor(Math.max(0, Number(finalTotal) || 0) / earnRate);
};

module.exports = {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_METHODS,
  roundCurrency,
  calculateShippingFee,
  getShippingConfig,
  findMatchingVariant,
  resolveAuthoritativeUnitPrice,
  validateAndPriceItems,
  validateAndCalculateCoupon,
  calculateLoyaltyRedemption,
  calculateEarnedPoints,
};
