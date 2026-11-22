const express = require("express");
const router = express.Router();
const notificationsController = require("./notifications.controller");
const pmNotificationsController = require("./pm.notifications.controller");
const smNotificationsController = require("./sm.notifications.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");

router.use(authMiddleware);

const MANAGEMENT_ROLES = ["admin", "product manager", "supplier manager"];

// Admin / role-scoped management notifications
router.get("/", roleMiddleware(...MANAGEMENT_ROLES), notificationsController.getNotifications);
router.patch("/mark-all-read", roleMiddleware(...MANAGEMENT_ROLES), notificationsController.markAllAsRead);
router.delete("/clear-all", roleMiddleware(...MANAGEMENT_ROLES), notificationsController.clearAll);

// Isolated Product Manager Endpoints
router.get("/pm", roleMiddleware("admin", "product manager"), pmNotificationsController.getNotifications);
router.patch("/pm/mark-all-read", roleMiddleware("admin", "product manager"), pmNotificationsController.markAllAsRead);
router.delete("/pm/clear-all", roleMiddleware("admin", "product manager"), pmNotificationsController.clearAll);

// Isolated Supplier Manager Endpoints
router.get("/sm", roleMiddleware("admin", "supplier manager"), smNotificationsController.getNotifications);
router.patch("/sm/mark-all-read", roleMiddleware("admin", "supplier manager"), smNotificationsController.markAllAsRead);
router.delete("/sm/clear-all", roleMiddleware("admin", "supplier manager"), smNotificationsController.clearAll);

// Universal Item-level Operations (Management roles only)
router.patch("/:id/read", roleMiddleware(...MANAGEMENT_ROLES), validateObjectId("id"), notificationsController.markAsRead);
router.delete("/:id", roleMiddleware(...MANAGEMENT_ROLES), validateObjectId("id"), notificationsController.deleteNotification);

module.exports = router;
