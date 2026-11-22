const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const notificationsService = require("../notifications/notifications.service");

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  roleId: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
  isDeleted: true,
  lastActiveAt: true,
  createdAt: true,
};

class UsersService {
  async getAll(skip = 0, take = 10) {
    return prisma.user.findMany({
      where: { isDeleted: false },
      select: SAFE_USER_SELECT,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
  }

  async update(id, data) {
    return prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
  }

  async delete(id) {
    return prisma.user.update({
      where: { id },
      data: { isDeleted: true },
      select: SAFE_USER_SELECT,
    });
  }

  async getTotalCount() {
    return prisma.user.count({ where: { isDeleted: false } });
  }

  async updatePassword(id, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long");
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
      select: SAFE_USER_SELECT,
    });
  }

  async requestPasswordChange(user) {
    if (!user) throw new Error("User context required");

    const existing = await prisma.passwordRequest.findFirst({
      where: { userId: user.id, status: "Pending", isDeleted: false },
    });

    if (existing) {
      throw new Error("You already have an active password reset request pending approval.");
    }

    await prisma.passwordRequest.create({
      data: { userId: user.id },
    });

    await notificationsService.create({
      type: "SYSTEM",
      title: "Password Reset Request",
      message: `${user.name} (${user.role || "Staff"}) has requested a manual password reset.`,
      link: `/admin/settings`,
    });
    return true;
  }

  async getPasswordRequests() {
    return prisma.passwordRequest.findMany({
      where: { isDeleted: false },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async deletePasswordRequest(id) {
    return prisma.passwordRequest.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

module.exports = new UsersService();
module.exports.SAFE_USER_SELECT = SAFE_USER_SELECT;
