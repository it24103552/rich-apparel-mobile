const { z } = require("zod");
const { OBJECT_ID_REGEX } = require("../../middleware/objectId.middleware");

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name cannot exceed 100 characters"),
  email: z.string().trim().email("Invalid email format"),
  phone: z.string().trim().min(7, "Phone number must be at least 7 characters").max(20).optional(),
  roleId: z.string().regex(OBJECT_ID_REGEX, "Invalid roleId format").optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name cannot exceed 100 characters").optional(),
  email: z.string().trim().email("Invalid email format").optional(),
  phone: z.string().trim().regex(/^\d{10}$/, "Phone number must be exactly 10 digits").optional().or(z.literal("")),
  roleId: z.string().regex(OBJECT_ID_REGEX, "Invalid roleId format").optional(),
});

const updatePasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters").max(128, "Password is too long"),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  updatePasswordSchema,
};
