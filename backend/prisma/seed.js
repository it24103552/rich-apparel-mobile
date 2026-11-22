import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // 1. Create Roles
  console.log("📋 Creating roles...");
  const roles = [
    "Admin",
    "Product Manager",
    "Supplier Manager",
    "Customer"
  ];

  const roleMap = {};
  for (const roleName of roles) {
    const role = await prisma.role.findFirst({ where: { name: roleName } })
      ?? await prisma.role.create({ data: { name: roleName } });
    roleMap[roleName] = role.id;
    console.log(`✅ ${roleName} role created/found:`, role.id);
  }

  // 2. Create Admin and Manager Users
  console.log("👤 Creating admin and manager users...");
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const users = [
    { name: "System Admin", email: "admin@store.com", role: "Admin" },
    { name: "Product Manager", email: "product@shop.com", role: "Product Manager" },
    { name: "Supplier Manager", email: "supplier@shop.com", role: "Supplier Manager" },
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        password: hashedPassword,
        roleId: roleMap[userData.role],
      },
      create: {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        roleId: roleMap[userData.role],
      },
    });
    console.log(`✅ ${userData.role} user created/updated:`, user.id);
  }

  // 3. Create Sample Apparel Collections (Categories)
  console.log("🏷️  Creating apparel collections (Women, Men, Sporty)...");
  const defaultVariantConfig = [
    { name: "Size", options: ["S", "M", "L", "XL"] },
    { name: "Color", options: ["Black", "White", "Navy", "Beige"] },
  ];

  const women = await prisma.category.findFirst({ where: { name: "Women" } })
    ?? await prisma.category.create({
      data: {
        name: "Women",
        description: "Contemporary dresses, tops, and everyday essentials curated for women",
        variantConfig: defaultVariantConfig,
      },
    });
  console.log("✅ Women collection created:", women.id);

  const men = await prisma.category.findFirst({ where: { name: "Men" } })
    ?? await prisma.category.create({
      data: {
        name: "Men",
        description: "Tailored shirts, casual tees, trousers, and modern essentials for men",
        variantConfig: defaultVariantConfig,
      },
    });
  console.log("✅ Men collection created:", men.id);

  const sporty = await prisma.category.findFirst({ where: { name: "Sporty" } })
    ?? await prisma.category.create({
      data: {
        name: "Sporty",
        description: "High-performance activewear, gym essentials, and athletic apparel",
        variantConfig: defaultVariantConfig,
      },
    });
  console.log("✅ Sporty collection created:", sporty.id);

  // 4. Create Sample Suppliers
  console.log("🏭 Creating sample suppliers...");
  const supplier1 = await prisma.supplier.findFirst({ where: { email: "supplier1@company.com" } })
    ?? await prisma.supplier.create({
      data: {
        name: "ActiveWear Textiles Ltd",
        email: "supplier1@company.com",
        phone: "+1-555-0101",
      },
    });
  console.log("✅ Supplier 1 created:", supplier1.id);

  const supplier2 = await prisma.supplier.findFirst({ where: { email: "supplier2@company.com" } })
    ?? await prisma.supplier.create({
      data: {
        name: "Fashion Wholesale Ltd",
        email: "supplier2@company.com",
        phone: "+1-555-0102",
      },
    });
  console.log("✅ Supplier 2 created:", supplier2.id);

  // 5. Create Sample Apparel Products
  console.log("📦 Creating sample apparel products...");
  const product1 = await prisma.product.findFirst({ where: { name: "Floral Linen Midi Dress" } })
    ?? await prisma.product.create({
      data: {
        name: "Floral Linen Midi Dress",
        sku: "RA-WOMEN-001",
        description: "Breathable linen blend midi dress tailored for effortless everyday elegance",
        price: 4500,
        costPrice: 2800,
        stock: 50,
        categoryId: women.id,
        supplierId: supplier2.id,
        imageUrl: null,
      },
    });
  console.log("✅ Product 1 (Women) created:", product1.id);

  const product2 = await prisma.product.findFirst({ where: { name: "Cotton T-Shirt" } })
    ?? await prisma.product.create({
      data: {
        name: "Cotton T-Shirt",
        sku: "RA-MEN-001",
        description: "100% organic cotton comfortable crew-neck t-shirt for men",
        price: 2490,
        costPrice: 1400,
        stock: 100,
        categoryId: men.id,
        supplierId: supplier2.id,
        imageUrl: null,
      },
    });
  console.log("✅ Product 2 (Men) created:", product2.id);

  const product3 = await prisma.product.findFirst({ where: { name: "Performance Dry-Fit Track Jacket" } })
    ?? await prisma.product.create({
      data: {
        name: "Performance Dry-Fit Track Jacket",
        sku: "RA-SPORTY-001",
        description: "Lightweight moisture-wicking athletic track jacket built for training and movement",
        price: 3850,
        costPrice: 2200,
        stock: 40,
        categoryId: sporty.id,
        supplierId: supplier1.id,
        imageUrl: null,
      },
    });
  console.log("✅ Product 3 (Sporty) created:", product3.id);

  // 6. Create Sample Coupons
  console.log("🎟️  Creating sample coupons...");
  const coupon1 = await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: {
      code: "WELCOME10",
      discount: 10,
      minCartValue: 50,
      firstOrder: true,
    },
  });
  console.log("✅ Coupon 1 created:", coupon1.id);

  const coupon2 = await prisma.coupon.upsert({
    where: { code: "SUMMER20" },
    update: {},
    create: {
      code: "SUMMER20",
      discount: 20,
      minCartValue: 100,
      firstOrder: false,
    },
  });
  console.log("✅ Coupon 2 created:", coupon2.id);

  console.log("\n✨ Database seeding completed successfully!");
  console.log("\n📝 Login credentials:");
  console.log("   Email: admin@store.com");
  console.log("   Password: admin123");
  console.log("\n🎯 Test with:");
  console.log("   curl -X POST http://localhost:5001/api/v1/auth/login \\");
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"email":"admin@store.com","password":"admin123"}\'');
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
