const chatService = require("./chat.service");
const supabase = require("../../config/supabase");
const path = require("path");

// Security: only the "admin" role may act on behalf of support / other users.
const isAdminUser = (user) => String(user?.role || "").toLowerCase() === "admin";

class ChatController {
  async sendMessage(req, res, next) {
    try {
      const callerIsAdmin = isAdminUser(req.user);
      const senderId = req.user.id;

      // Admin: existing behaviour (trusts body values for replies).
      // Non-admin (customer): identity and routing are derived from the JWT only;
      // client-supplied isAdmin / receiverId / senderName are ignored.
      const message = req.body.message;
      const receiverId = callerIsAdmin ? req.body.receiverId : null;
      const isAdmin = callerIsAdmin ? req.body.isAdmin : false;
      const senderName = callerIsAdmin ? req.body.senderName : req.user.name;
      let imageUrl = null;

      if (req.file) {
        const fileExt = path.extname(req.file.originalname);
        const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExt}`;
        const filePath = `chat/${fileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });

        if (uploadError) {
          console.error("❌ Supabase Chat Upload Error:", uploadError);
          throw new Error(`Cloud upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      const chatMessage = await chatService.sendMessage({
        senderId,
        senderName: senderName || req.user.name || "Unknown User",
        receiverId: receiverId || null,
        message: message || (imageUrl ? "" : " "), // Allow empty message if image exists
        isAdmin: isAdmin === "true" || isAdmin === true || false, // Handle string from FormData
        imageUrl,
      });

      res.status(201).json({
        success: true,
        data: chatMessage,
      });
    } catch (error) {
      next(error);
    }
  }

  async getChatHistory(req, res, next) {
    try {
      const isForAdmin = isAdminUser(req.user);
      const userId = req.params.userId || req.user.id;

      // Security: non-admins may only read their own conversation.
      if (!isForAdmin && String(userId) !== String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden - you can only access your own chat history",
        });
      }
      const history = await chatService.getChatHistory(userId, isForAdmin);

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  async clearChatUI(req, res, next) {
    try {
      await chatService.clearChatUI(req.user.id);
      res.status(200).json({
        success: true,
        message: "Chat UI cleared successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllMessagesGrouped(req, res, next) {
    try {
      const groups = await chatService.getAllMessagesGrouped();

      res.status(200).json({
        success: true,
        data: groups,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const { customerId } = req.params;
      await chatService.markAsRead(customerId);

      res.status(200).json({
        success: true,
        message: "Messages marked as read",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ChatController();
