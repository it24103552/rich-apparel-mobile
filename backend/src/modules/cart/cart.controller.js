const cartService = require("./cart.service");
const { sendSuccess, sendError } = require("../../utils/response");

class CartController {
  async getCart(req, res) {
    try {
      const cart = await cartService.getCart(req.user.id);
      return sendSuccess(res, "Cart fetched", cart || { items: [], total: 0 });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async addItem(req, res) {
    try {
      const { productId, quantity, variantAttributes } = req.body;
      await cartService.addItem(req.user.id, productId, quantity, variantAttributes);
      const cart = await cartService.getCart(req.user.id);
      return sendSuccess(res, "Item added", cart);
    } catch (error) {
      const status = error.status || 400;
      return sendError(res, error.message, status, null, error.errorCode);
    }
  }

  async removeItem(req, res) {
    try {
      await cartService.removeItem(req.params.id, req.user.id);
      const cart = await cartService.getCart(req.user.id);
      return sendSuccess(res, "Item removed", cart);
    } catch (error) {
      const status = error.status || (error.message.includes("Forbidden") ? 403 : 400);
      return sendError(res, error.message, status, null, error.errorCode);
    }
  }

  async updateItem(req, res) {
    try {
      const { quantity } = req.body;
      await cartService.updateItem(req.params.id, req.user.id, quantity);
      const cart = await cartService.getCart(req.user.id);
      return sendSuccess(res, "Item updated", cart);
    } catch (error) {
      const status = error.status || (error.message.includes("Forbidden") ? 403 : 400);
      return sendError(res, error.message, status, null, error.errorCode);
    }
  }
}

module.exports = new CartController();
