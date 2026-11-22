const express = require("express");
const productsController = require("./products.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { optionalAuthMiddleware } = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const multer = require("../../config/multerMemory");
const { createProductSchema, updateProductSchema } = require("./products.validation");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin", "product manager"),
  multer.array("images", 5),
  validateRequest(createProductSchema),
  productsController.create.bind(productsController)
);
router.get("/", optionalAuthMiddleware, productsController.getAll.bind(productsController));
router.get("/popular", productsController.getPopular.bind(productsController));
router.get(
  "/low-stock",
  authMiddleware,
  roleMiddleware("admin", "product manager"),
  productsController.getLowStock.bind(productsController)
);
router.get("/:id", optionalAuthMiddleware, validateObjectId("id"), productsController.getById.bind(productsController));
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "product manager"),
  validateObjectId("id"),
  multer.array("images", 5),
  validateRequest(updateProductSchema),
  productsController.update.bind(productsController)
);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "product manager"),
  validateObjectId("id"),
  productsController.delete.bind(productsController)
);

module.exports = router;
