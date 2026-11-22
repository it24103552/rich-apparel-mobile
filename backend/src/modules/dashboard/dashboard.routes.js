const express = require("express");
const dashboardController = require("./dashboard.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const router = express.Router();
router.get("/", authMiddleware, roleMiddleware("admin", "product manager"), dashboardController.getDashboardData.bind(dashboardController));
router.get("/supplier", authMiddleware, roleMiddleware("admin", "supplier manager"), dashboardController.getSupplierDashboardData.bind(dashboardController));
router.get("/overall", authMiddleware, roleMiddleware("admin"), dashboardController.getAdminOverallData.bind(dashboardController));
module.exports = router;
