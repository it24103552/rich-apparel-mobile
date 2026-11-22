const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendEmail } = require("../../config/mailer");

const SAFE_STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  roleId: true,
  role: { select: { id: true, name: true } },
  isDeleted: true,
  lastActiveAt: true,
  createdAt: true,
};

class StaffService {
  generatePassword() {
    return crypto.randomBytes(9).toString("base64url");
  }

  async create(data, roleId) {
    const password = data.password || this.generatePassword();
    let user;

    try {
      const normalizedEmail = String(data.email || "").trim().toLowerCase();
      user = await prisma.user.create({
        data: {
          name: data.name,
          email: normalizedEmail,
          phone: data.phone,
          roleId,
          password: await bcrypt.hash(password, 10),
        },
        select: SAFE_STAFF_SELECT,
      });

      try {
        await sendEmail(
          user.email,
          "Welcome to Admin Panel - Your Login Credentials",
          `Hello ${user.name},\n\nYour account has been created successfully.\n\nEmail: ${user.email}\nPassword: ${password}\n\nPlease log in and change your password immediately.\n\nLogin URL: ${process.env.FRONTEND_URL}/login`,
          `<h2>Welcome to Admin Panel</h2><p>Hello ${user.name},</p><p>Your account has been created successfully.</p><p><strong>Email:</strong> ${user.email}</p><p><strong>Password:</strong> ${password}</p><p>Please <a href="${process.env.FRONTEND_URL}/login">log in</a> and change your password immediately.</p>`
        );
        return user;
      } catch (emailError) {
        console.error("Email sending failed. Rolling back staff creation:", emailError.message);
        await prisma.user.delete({ where: { id: user.id } });
        throw new Error("Failed to send welcome email. Staff creation rolled back.");
      }
    } catch (error) {
      throw error;
    }
  }

  async getAll(skip = 0, take = 10) {
    return prisma.user.findMany({
      where: { role: { name: { notIn: ["Customer"] } }, isDeleted: false },
      select: SAFE_STAFF_SELECT,
      skip,
      take,
    });
  }

  async getById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: SAFE_STAFF_SELECT,
    });
  }

  async update(id, data) {
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = String(data.email).trim().toLowerCase();
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.roleId !== undefined) updateData.roleId = data.roleId;

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: SAFE_STAFF_SELECT,
    });
  }

  async delete(id) {
    return prisma.user.update({
      where: { id },
      data: { isDeleted: true },
      select: SAFE_STAFF_SELECT,
    });
  }

  async getTotalCount() {
    return prisma.user.count({
      where: { role: { name: { notIn: ["Customer"] } }, isDeleted: false },
    });
  }
}

module.exports = new StaffService();
