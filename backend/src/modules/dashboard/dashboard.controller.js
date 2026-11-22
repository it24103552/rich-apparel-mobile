const dashboardService = require("./dashboard.service");
const { sendSuccess, sendError } = require("../../utils/response");

class DashboardController {
  async getDashboardData(req, res) {
    try {
      const data = await dashboardService.getDashboardData();
      return sendSuccess(res, "Dashboard data fetched", data);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getSupplierDashboardData(req, res) {
    try {
      const data = await dashboardService.getSupplierDashboardData();
      return sendSuccess(res, "Supplier Dashboard data fetched", data);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getAdminOverallData(req, res) {
    try {
      const data = await dashboardService.getAdminOverallData();
      return sendSuccess(res, "Admin Overall Dashboard data fetched", data);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new DashboardController();
