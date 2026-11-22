const prisma = require("../../config/prisma");
const { isVariantMatch } = require("../../utils/variantMatcher");

const CART_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  price: true,
  stock: true,
  imageUrl: true,
  images: true,
  variants: true,
  isActive: true,
  isDeleted: true,
  categoryId: true,
};

class CartService {
  async getCart(userId) {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { select: CART_PRODUCT_SELECT },
          },
        },
      },
    });

    if (!cart) return { items: [], total: 0 };

    const itemsWithStock = cart.items.map((item) => {
      const maxStock = this.#getAvailableStock(item.product, item.variantAttributes);
      const unitPrice = this.#getUnitPrice(item.product, item.variantAttributes);
      return { ...item, maxStock, unitPrice };
    });

    const total = itemsWithStock.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    return { ...cart, items: itemsWithStock, total };
  }

  async addItem(userId, productId, quantity, variantAttributes = null) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }

    let cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) cart = await prisma.cart.create({ data: { userId } });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: { select: { isActive: true, isDeleted: true } } },
    });

    if (!product || product.isDeleted) {
      const err = new Error("Product not found");
      err.status = 404;
      err.errorCode = "PRODUCT_NOT_FOUND";
      throw err;
    }

    if (product.isActive === false || product.category?.isDeleted || product.category?.isActive === false) {
      const err = new Error("Product is currently unavailable");
      err.status = 400;
      err.errorCode = "PRODUCT_UNAVAILABLE";
      throw err;
    }

    const availableStock = this.#getAvailableStock(product, variantAttributes);

    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: productId,
        variantAttributes: variantAttributes ? { equals: variantAttributes } : { equals: null },
      },
    });

    const newQuantity = (existingItem?.quantity || 0) + quantity;

    if (availableStock <= 0 || newQuantity > availableStock) {
      const err = new Error(`Insufficient stock. Only ${availableStock} items available.`);
      err.status = 400;
      err.errorCode = "INSUFFICIENT_STOCK";
      throw err;
    }

    if (existingItem) {
      return prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
        include: { product: { select: CART_PRODUCT_SELECT } },
      });
    }

    return prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        quantity,
        variantAttributes,
      },
      include: { product: { select: CART_PRODUCT_SELECT } },
    });
  }

  async updateItem(cartItemId, userId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }

    const item = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: {
        cart: { select: { userId: true } },
        product: { select: CART_PRODUCT_SELECT },
      },
    });

    if (!item) {
      const err = new Error("Cart item not found");
      err.status = 404;
      err.errorCode = "NOT_FOUND";
      throw err;
    }

    if (item.cart?.userId !== userId) {
      const err = new Error("Forbidden - Cart item does not belong to this user");
      err.status = 403;
      err.errorCode = "FORBIDDEN";
      throw err;
    }

    if (!item.product || item.product.isDeleted || item.product.isActive === false) {
      const err = new Error("Product is no longer available");
      err.status = 400;
      err.errorCode = "PRODUCT_UNAVAILABLE";
      throw err;
    }

    const availableStock = this.#getAvailableStock(item.product, item.variantAttributes);

    if (quantity > availableStock) {
      const err = new Error(`Insufficient stock. Only ${availableStock} items available.`);
      err.status = 400;
      err.errorCode = "INSUFFICIENT_STOCK";
      throw err;
    }

    return prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
      include: { product: { select: CART_PRODUCT_SELECT } },
    });
  }

  async removeItem(cartItemId, userId) {
    const item = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { cart: { select: { userId: true } } },
    });

    if (!item) {
      const err = new Error("Cart item not found");
      err.status = 404;
      err.errorCode = "NOT_FOUND";
      throw err;
    }

    if (item.cart?.userId !== userId) {
      const err = new Error("Forbidden - Cart item does not belong to this user");
      err.status = 403;
      err.errorCode = "FORBIDDEN";
      throw err;
    }

    return prisma.cartItem.delete({ where: { id: cartItemId } });
  }

  async clearCart(userId) {
    return prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  }

  #findMatchingVariant(product, variantAttributes) {
    if (!product?.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
      return null;
    }
    return product.variants.find((v) => {
      if (variantAttributes?.id) return v.id === variantAttributes.id;
      return isVariantMatch(v.attributes || v, variantAttributes);
    }) || null;
  }

  #getAvailableStock(product, variantAttributes) {
    if (!product || product.isDeleted || product.isActive === false) return 0;

    if (!product.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
      return product.stock || 0;
    }

    const matchingVariant = this.#findMatchingVariant(product, variantAttributes);
    return matchingVariant ? (parseInt(matchingVariant.stock, 10) || 0) : 0;
  }

  #getUnitPrice(product, variantAttributes) {
    if (!product) return 0;
    const basePrice = Number(product.price) || 0;
    const matchingVariant = this.#findMatchingVariant(product, variantAttributes);
    if (!matchingVariant) return basePrice;
    if (typeof matchingVariant.price === "number" && matchingVariant.price > 0) {
      return matchingVariant.price;
    }
    return Math.max(0, basePrice + (Number(matchingVariant.priceAdj) || 0));
  }
}

module.exports = new CartService();
