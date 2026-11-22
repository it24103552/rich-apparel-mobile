const { z } = require("zod");
const { OBJECT_ID_REGEX } = require("../../middleware/objectId.middleware");

const ALLOWED_CLIENT_PAYMENT_METHODS = ["cash_on_delivery", "bank_deposit"];
const ALLOWED_PAYMENT_STATUSES = [
  "pending",
  "pending_verification",
  "paid",
  "failed",
  "refund_pending",
  "refunded",
  "cancelled",
];

const createPaymentSchema = z.object({
  orderId: z.string().regex(OBJECT_ID_REGEX, "Invalid orderId format"),
  method: z.enum(ALLOWED_CLIENT_PAYMENT_METHODS, {
    errorMap: () => ({
      message:
        "Unsupported payment method. Only cash_on_delivery and bank_deposit are supported.",
    }),
  }),
  // Accepted optionally for backward compatibility with existing clients,
  // but strictly ignored by the backend (amount & status are always server-derived).
  amount: z.coerce.number().optional(),
  status: z.string().optional(),
});

const updatePaymentStatusSchema = z.object({
  status: z.enum(ALLOWED_PAYMENT_STATUSES, {
    errorMap: () => ({
      message: `status must be one of: ${ALLOWED_PAYMENT_STATUSES.join(", ")}`,
    }),
  }),
});

module.exports = {
  ALLOWED_CLIENT_PAYMENT_METHODS,
  ALLOWED_PAYMENT_STATUSES,
  createPaymentSchema,
  updatePaymentStatusSchema,
};
