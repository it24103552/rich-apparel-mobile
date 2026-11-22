const express = require("express");
const suppliersController = require("./suppliers.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const roleMiddleware = require("../../middleware/role.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const multer = require("../../config/multerMemory");
const { createSupplierSchema, updateSupplierSchema } = require("./suppliers.validation");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin", "supplier manager"),
  multer.single("image"),
  validateRequest(createSupplierSchema),
  suppliersController.create.bind(suppliersController)
);
router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "supplier manager", "product manager"),
  suppliersController.getAll.bind(suppliersController)
);
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "supplier manager", "product manager"),
  validateObjectId("id"),
  suppliersController.getById.bind(suppliersController)
);
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "supplier manager"),
  validateObjectId("id"),
  multer.single("image"),
  validateRequest(updateSupplierSchema),
  suppliersController.update.bind(suppliersController)
);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "supplier manager"),
  validateObjectId("id"),
  suppliersController.delete.bind(suppliersController)
);

module.exports = router;
