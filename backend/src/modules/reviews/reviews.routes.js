const express = require("express");
const reviewsController = require("./reviews.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const validateRequest = require("../../middleware/validate.middleware");
const { validateObjectId } = require("../../middleware/objectId.middleware");
const multer = require("../../config/multer");
const { createReviewSchema, updateReviewSchema } = require("./reviews.validation");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  multer.memory.single("image"),
  validateRequest(createReviewSchema),
  reviewsController.create.bind(reviewsController)
);
router.get("/", reviewsController.getAll.bind(reviewsController));
router.get("/mine", authMiddleware, reviewsController.getMine.bind(reviewsController));
router.get("/:id", validateObjectId("id"), reviewsController.getById.bind(reviewsController));
router.put(
  "/:id",
  authMiddleware,
  validateObjectId("id"),
  multer.memory.single("image"),
  validateRequest(updateReviewSchema),
  reviewsController.update.bind(reviewsController)
);
router.delete("/:id", authMiddleware, validateObjectId("id"), reviewsController.delete.bind(reviewsController));

module.exports = router;
