const express = require("express");
const activitiesController = require("./activities.controller");
const pmActivitiesController = require("./pm.activities.controller");
const smActivitiesController = require("./sm.activities.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");

const router = express.Router();

// All activity routes are protected and restricted to management roles
router.use(authMiddleware);
router.use(roleMiddleware("admin", "product manager", "supplier manager"));

// Legacy Universal Endpoints
router.get("/", activitiesController.getAll);
router.delete("/", roleMiddleware("admin"), activitiesController.clearAll);

// Isolated Product Manager Endpoints
router.get("/pm", roleMiddleware("admin", "product manager"), pmActivitiesController.getAll);
router.delete("/pm", roleMiddleware("admin", "product manager"), pmActivitiesController.clearAll);

// Isolated Supplier Manager Endpoints
router.get("/sm", roleMiddleware("admin", "supplier manager"), smActivitiesController.getAll);
router.delete("/sm", roleMiddleware("admin", "supplier manager"), smActivitiesController.clearAll);

// Cross-domain Item Endpoints
router.get("/user/:userId", roleMiddleware("admin"), validateObjectId("userId"), activitiesController.getByUser);
router.delete("/:id", roleMiddleware("admin"), validateObjectId("id"), activitiesController.deleteById);

module.exports = router;
