const paymentsService = require("./payments.service");
const { sendSuccess, sendError } = require("../../utils/response");
const { hasAnyRole } = require("../../middleware/role.middleware");
const { toAbsoluteMediaUrl } = require("../../utils/media");
const supabase = require("../../config/supabase");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

class PaymentsController {
  async create(req, res) {
    try {
      // Strictly ignore client-supplied amount and status — always server-derived!
      const { orderId, method } = req.body;
      const isAdmin = hasAnyRole(req.user.role, ["admin"]);

      if (method === "bank_deposit" && !req.file) {
        return sendError(
          res,
          "Proof image is required for bank deposit",
          400,
          null,
          "PROOF_IMAGE_REQUIRED"
        );
      }

      // Pre-verify order ownership and payment eligibility BEFORE uploading any file
      await paymentsService.verifyPaymentEligibility({
        orderId,
        userId: req.user.id,
        isAdmin,
      });

      let proofImageUrl = null;

      if (req.file) {
        const sanitizedExt = path.extname(req.file.originalname || "").replace(/[^a-zA-Z0-9.]/g, "") || ".jpg";
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${sanitizedExt}`;
        try {
          const { error } = await supabase.storage
            .from("payments")
            .upload(`slips/${fileName}`, req.file.buffer, {
              contentType: req.file.mimetype,
              upsert: true,
            });

          if (error) throw error;

          const {
            data: { publicUrl },
          } = supabase.storage.from("payments").getPublicUrl(`slips/${fileName}`);

          proofImageUrl = publicUrl;
        } catch (uploadError) {
          console.warn("⚠️ Supabase upload failed, falling back to local storage:", uploadError.message);

          const uploadDir = path.join(process.cwd(), "uploads", "payments");
          if (!fs.existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true });
          }

          const localFilePath = path.join(uploadDir, fileName);
          await writeFile(localFilePath, req.file.buffer);

          proofImageUrl = toAbsoluteMediaUrl(`/uploads/payments/${fileName}`, req);
        }
      }

      const payment = await paymentsService.create({
        orderId,
        method,
        proofImageUrl,
        userId: req.user.id,
        isAdmin,
      });

      return sendSuccess(res, "Payment created", payment, 201);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }

  async getAll(req, res) {
    try {
      const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
      const take = Math.min(Math.max(1, parseInt(req.query.take, 10) || 10), 1000);
      const payments = await paymentsService.getAll(skip, take);
      const total = await paymentsService.getTotalCount();
      return sendSuccess(res, "Payments fetched", { payments, total });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getById(req, res) {
    try {
      const payment = await paymentsService.getById(req.params.id);
      if (!payment) {
        return sendError(res, "Payment not found", 404, null, "NOT_FOUND");
      }

      const isAdmin = hasAnyRole(req.user.role, ["admin"]);
      if (!isAdmin && payment.order?.userId !== req.user.id) {
        return sendError(
          res,
          "Forbidden - You can only view payments for your own orders",
          403,
          null,
          "FORBIDDEN"
        );
      }

      return sendSuccess(res, "Payment fetched", payment);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async updateStatus(req, res) {
    try {
      const payment = await paymentsService.updateStatus(req.params.id, req.body.status);
      return sendSuccess(res, "Status updated", payment);
    } catch (error) {
      return sendError(res, error.message, error.status || 400, null, error.errorCode);
    }
  }
}

module.exports = new PaymentsController();
