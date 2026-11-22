const ordersService = require("./orders.service");
const { sendSuccess, sendError } = require("../../utils/response");
const { hasAnyRole } = require("../../middleware/role.middleware");
const { getShippingConfig } = require("../../utils/pricing");

class OrdersController {
  async getShippingConfig(req, res) {
    return sendSuccess(res, "Shipping configuration fetched", getShippingConfig());
  }

  async quote(req, res) {
    try {
      const { items, deliveryMethod = "standard_delivery", couponCode = "", pointsUsed = 0 } = req.body;
      const result = await ordersService.calculateQuote(req.user.id, {
        items,
        deliveryMethod,
        couponCode,
        pointsUsed,
      });
      return sendSuccess(res, "Order quote calculated", result);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async create(req, res) {
    try {
      // Strictly ignore client-supplied total, shippingFee, and item.price —
      // ordersService.create() computes all financial values from DB records.
      const {
        items,
        address,
        contactNumber,
        contactEmail,
        deliveryMethod,
        couponCode = "",
        pointsUsed = 0,
      } = req.body;

      const order = await ordersService.create(
        req.user.id,
        items,
        address,
        contactNumber,
        contactEmail,
        deliveryMethod,
        couponCode,
        pointsUsed
      );
      return sendSuccess(res, "Order created", order, 201);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async getAll(req, res) {
    try {
      const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10) || 1) : null;
      const limit = req.query.limit ? Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100) : null;
      const skip = page !== null ? (page - 1) * (limit || 20) : Math.max(0, parseInt(req.query.skip, 10) || 0);
      const take = limit !== null ? limit : Math.min(Math.max(1, parseInt(req.query.take, 10) || 10), 1000);

      const isAdmin = hasAnyRole(req.user.role, ["admin"]);
      const [orders, total] = await Promise.all([
        ordersService.getAll(req.user.id, skip, take, isAdmin),
        ordersService.getTotalCount(req.user.id, isAdmin),
      ]);

      const effectiveLimit = take;
      const currentPage = page || Math.floor(skip / effectiveLimit) + 1;
      const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

      return sendSuccess(res, "Orders fetched", {
        orders,
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
      const order = await ordersService.getById(req.params.id);
      if (!order || order.isDeleted) {
        return sendError(res, "Order not found", 404, null, "ORDER_NOT_FOUND");
      }

      const isAdmin = hasAnyRole(req.user.role, ["admin"]);
      if (!isAdmin && order.userId !== req.user.id) {
        return sendError(res, "Forbidden - You can only access your own orders", 403, null, "FORBIDDEN");
      }

      return sendSuccess(res, "Order fetched", order);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async updateStatus(req, res) {
    try {
      const order = await ordersService.updateStatus(req.params.id, req.body.status);
      return sendSuccess(res, "Status updated", order);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async delete(req, res) {
    try {
      await ordersService.delete(req.params.id);
      return sendSuccess(res, "Order deleted");
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async updateByUser(req, res) {
    try {
      const order = await ordersService.updateByUser(req.params.id, req.user.id, req.body);
      return sendSuccess(res, "Order updated", order);
    } catch (error) {
      const status =
        error.status ||
        (error.message.includes("Unauthorized") || error.message.includes("Can only") ? 403 : 400);
      return sendError(res, error.message, status, null, error.errorCode);
    }
  }

  async cancelByUser(req, res) {
    try {
      await ordersService.cancelByUser(req.params.id, req.user.id);
      return sendSuccess(res, "Order cancelled");
    } catch (error) {
      const status =
        error.status ||
        (error.message.includes("Unauthorized") || error.message.includes("Can only") ? 403 : 400);
      return sendError(res, error.message, status, null, error.errorCode);
    }
  }

  async processRefund(req, res) {
    try {
      const order = await ordersService.processRefund(req.params.id);
      return sendSuccess(res, "Refund processed successfully", order);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async applyDiscount(req, res) {
    try {
      const { couponCode, pointsUsed } = req.body;
      const result = await ordersService.applyDiscount(req.user.id, req.params.id, {
        couponCode,
        pointsUsed,
      });
      return sendSuccess(res, "Discount applied", result);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async getDiscountDetails(req, res) {
    try {
      const order = await ordersService.getById(req.params.id);
      if (!order || order.isDeleted) {
        return sendError(res, "Order not found", 404, null, "ORDER_NOT_FOUND");
      }

      const isAdmin = hasAnyRole(req.user.role, ["admin"]);
      if (!isAdmin && order.userId !== req.user.id) {
        return sendError(res, "Forbidden - You can only access your own order discounts", 403, null, "FORBIDDEN");
      }

      const discount = await ordersService.getDiscountDetails(req.params.id);
      return sendSuccess(res, "Discount details fetched", discount);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async saveDiscount(req, res) {
    try {
      const { couponCode, pointsUsed } = req.body;
      const result = await ordersService.saveDiscount(req.user.id, req.params.id, {
        couponCode,
        pointsUsed,
      });
      return sendSuccess(res, "Discount saved and applied", result);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async createReturnOrder(req, res) {
    try {
      const { userId, items, address, contactNumber, contactEmail, returnRequestId, notes } = req.body;
      const order = await ordersService.createReturnOrder({
        userId,
        items,
        address,
        contactNumber,
        contactEmail,
        returnRequestId,
        notes,
      });
      return sendSuccess(res, "Return replacement order created", order, 201);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }
}

module.exports = new OrdersController();
