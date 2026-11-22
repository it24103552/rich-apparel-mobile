const prisma = require("../../config/prisma");
const { sendEmail } = require("../../config/mailer");
const { validateAndPriceItems, validateAndCalculateCoupon } = require("../../utils/pricing");

class CouponsService {
  async create(data) {
    // Check if code already exists
    const existing = await prisma.coupon.findUnique({
      where: { code: data.code }
    });
    if (existing) {
      throw new Error(`A coupon with the code "${data.code}" already exists. Please choose a unique code.`);
    }

    const coupon = await prisma.coupon.create({ data });
    
    // Trigger in-app notification for Admin
    const notificationsService = require("../notifications/notifications.service");
    await notificationsService.create({
      type: 'LOYALTY',
      title: 'Coupon Created',
      message: `A new promotion "${coupon.code}" has been launched.`,
      link: `/admin/coupons`
    }).catch(console.error);

    // Send marketing email to all users about the new coupon (fire-and-forget)
    this.#sendCouponMarketingEmail(coupon).catch(console.error);

    return coupon;
  }

  async getAll(skip = 0, take = 10) {
    return prisma.coupon.findMany({
      where: { isDeleted: false },
      skip,
      take,
    });
  }

  async getAvailableCoupons(user = null) {
    const allCoupons = await prisma.coupon.findMany({
      where: { isDeleted: false }
    });

    const eligibleCoupons = [];
    
    // Check order count if user is logged in
    let orderCount = 0;
    if (user) {
      orderCount = await prisma.order.count({
        where: { userId: user.id, isDeleted: false }
      });
    }

    for (const coupon of allCoupons) {
      let isEligible = false;
      
      if (coupon.audienceType === 'all') {
        isEligible = true;
      } else if (coupon.audienceType === 'new') {
        // If guest, we don't show "new" yet, or we show it as bait?
        // User requested: "new customers mean this created cupons is show only 0 orders donr customers"
        // If guest, technically 0 orders, but we usually want them to sign up. 
        // For now, only show to logged-in new users to be safe.
        if (user && orderCount === 0) isEligible = true;
      } else if (coupon.audienceType === 'specific') {
        if (user && coupon.audienceUserIds?.includes(user.id)) isEligible = true;
      }
      
      if (isEligible) {
        // One-time use check
        if (user) {
          const usedCount = await prisma.orderDiscount.count({
            where: {
              couponId: coupon.id,
              order: {
                userId: user.id,
                isDeleted: false
              }
            }
          });
          if (usedCount > 0) isEligible = false;
        }
      }
      
      if (isEligible) {
        // Strip out audienceUserIds for security
        const { audienceUserIds, ...safeCoupon } = coupon;
        eligibleCoupons.push(safeCoupon);
      }
    }
    
    return eligibleCoupons;
  }

  async getById(id) {
    return prisma.coupon.findUnique({ where: { id } });
  }

  async update(id, data) {
    if (data.code) {
      const existing = await prisma.coupon.findUnique({
        where: { code: data.code }
      });
      if (existing && existing.id !== id) {
        throw new Error(`A coupon with the code "${data.code}" already exists. Please choose a unique code.`);
      }
    }
    const coupon = await prisma.coupon.update({ where: { id }, data });

    // Trigger in-app notification for Admin
    const notificationsService = require("../notifications/notifications.service");
    await notificationsService.create({
      type: 'LOYALTY',
      title: 'Coupon Modified',
      message: `The promotion "${coupon.code}" has been updated.`,
      link: `/admin/coupons`
    }).catch(console.error);

    return coupon;
  }

  async delete(id) {
    return prisma.coupon.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async getTotalCount() {
    return prisma.coupon.count({ where: { isDeleted: false } });
  }

  async validateCoupon(code) {
    const coupon = await prisma.coupon.findFirst({
      where: { code: String(code || "").trim(), isDeleted: false },
    });
    if (!coupon) return null;
    // Strip private audienceUserIds before returning to clients
    const { audienceUserIds, ...safeCoupon } = coupon;
    return safeCoupon;
  }

  async evaluateCoupon(userId, code, items) {
    // Always price items authoritatively from the database — never trust client prices or totals
    const { pricedItems, subtotal } = await validateAndPriceItems(prisma, items);
    const { coupon, couponDiscount, eligibleTotal } = await validateAndCalculateCoupon(prisma, {
      userId,
      couponCode: code,
      pricedItems,
      subtotal,
    });

    return {
      couponCode: coupon.code,
      discountAmount: couponDiscount,
      eligibleTotal,
      subtotal,
      message: "Coupon is valid for your cart",
    };
  }

  async #sendCouponMarketingEmail(coupon) {
    try {
      // Fetch all active users
      const users = await prisma.user.findMany({
        where: { isDeleted: false },
        select: { email: true, name: true }
      });

      if (users.length === 0) return;

      // Calculate discount percentage if applicable
      const discountText = `LKR ${coupon.discount.toFixed(2)}`;
      const minValue = coupon.minCartValue > 0 ? `Minimum cart value: LKR ${coupon.minCartValue}` : '';
      const firstOrderOnly = coupon.firstOrder ? 'Valid for first-time customers only!' : 'Valid for all customers';

      // Prepare HTML email template
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0 0 10px 0; font-size: 28px;">🎉 Special Offer!</h1>
              <p style="color: #666; margin: 0; font-size: 16px;">We have a new coupon just for you</p>
            </div>

            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
              <p style="margin: 0; font-size: 14px; opacity: 0.9;">Use coupon code</p>
              <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; letter-spacing: 2px;">${coupon.code}</p>
              <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold;">Save ${discountText}</p>
            </div>

            <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="color: #333; margin: 0 0 15px 0;">Offer Details:</h3>
              <ul style="margin: 0; padding-left: 20px; color: #666;">
                <li style="margin-bottom: 8px;">
                  <strong>Discount:</strong> ${discountText}
                </li>
                ${minValue ? `<li style="margin-bottom: 8px;"><strong>Minimum Order:</strong> ${minValue}</li>` : ''}
                <li style="margin-bottom: 8px;">
                  <strong>Eligibility:</strong> ${firstOrderOnly}
                </li>
              </ul>
            </div>

            <p style="color: #666; text-align: center; font-size: 14px; line-height: 1.6;">
              Don't miss out on this great opportunity to save! Shop now and use the coupon code <strong>${coupon.code}</strong> at checkout to redeem your discount.
            </p>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL}/" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Shop Now
              </a>
            </div>

            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              This is a promotional email. If you no longer wish to receive marketing emails, you can unsubscribe at any time.
            </p>
          </div>
        </div>
      `;

      const textContent = `
🎉 Special Offer!

Use coupon code: ${coupon.code}
Save: ${discountText}

${minValue ? `Minimum Order: ${minValue}` : ''}
Eligibility: ${firstOrderOnly}

Don't miss out on this great opportunity to save!
Shop now and use the coupon code ${coupon.code} at checkout.

Visit us: ${process.env.FRONTEND_URL}
      `;

      // Send email to all users
      for (const user of users) {
        await sendEmail(
          user.email,
          `🎉 Exclusive Coupon: ${coupon.code} - Save ${discountText}!`,
          textContent,
          html
        );
      }

      console.log(`Marketing email sent to ${users.length} users for coupon ${coupon.code}`);
    } catch (error) {
      console.error("Failed to send coupon marketing emails:", error);
      throw error;
    }
  }
}

module.exports = new CouponsService();
