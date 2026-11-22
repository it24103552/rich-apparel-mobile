# Database Seeding Guide — Rich Life Apparel

This guide explains how to seed your database with initial data including business roles, demo manager accounts, apparel collections (`Women`, `Men`, `Sporty`), suppliers, sample apparel products, and promotional coupons.

---

## Roles & Authorization

### `ADMIN` (`Admin`)
- Full system administration access across all management modules (overall analytics, products, collections, suppliers, orders, payments, returns, coupons, loyalty, reviews, support chat, customers, staff, and roles).

### `PRODUCT_MANAGER` (`Product Manager`)
- Manage products, product collections/categories (`Women`, `Men`, `Sporty`), and product-related inventory and restock workflows.

### `SUPPLIER_MANAGER` (`Supplier Manager`)
- Manage suppliers and supplier-related product and restock fulfillment operations.

### `Customer`
- Standard storefront customer role assigned automatically upon public user registration.

---

## What Gets Seeded (`backend/prisma/seed.js`)

### ✅ Roles (4)
- **Admin** (`ADMIN`) — Full system administration access
- **Product Manager** (`PRODUCT_MANAGER`) — Product, collection, and inventory management
- **Supplier Manager** (`SUPPLIER_MANAGER`) — Supplier and restock management
- **Customer** — Public storefront customer role

### ✅ Development / Demo Users (3)

> **Security Notice (Development vs. Production):**
> The credentials below are **development/demo test accounts** created by the seed script for local testing. In production environments, never use default demo passwords, and never expose real database credentials, JWT secrets, or Supabase service-role keys in documentation or source control.

| Role | Name | Email | Demo Password |
|---|---|---|---|
| `Admin` | System Admin | `admin@store.com` | `admin123` |
| `Product Manager` | Product Manager | `product@shop.com` | `admin123` |
| `Supplier Manager` | Supplier Manager | `supplier@shop.com` | `admin123` |

*(Note: Running `node seedRoles.js` ensures `admin@shop.com`, `product@shop.com`, and `supplier@shop.com` with demo password `Password123!`.)*

### ✅ Product Collections / Categories (3)
- **Women** — Contemporary dresses, tops, and everyday essentials curated for women (`Size`, `Color` variant config)
- **Men** — Tailored shirts, casual tees, trousers, and modern essentials for men (`Size`, `Color` variant config)
- **Sporty** — High-performance activewear, gym essentials, and athletic apparel (`Size`, `Color` variant config)

### ✅ Suppliers (2)
- ActiveWear Textiles Ltd (`supplier1@company.com`)
- Fashion Wholesale Ltd (`supplier2@company.com`)

### ✅ Sample Apparel Products (3)
- **Floral Linen Midi Dress** (`Women` collection)
- **Cotton T-Shirt** (`Men` collection)
- **Performance Dry-Fit Track Jacket** (`Sporty` collection)

### ✅ Coupons (2)
- `WELCOME10` — 10% off (first order only, min cart value 50)
- `SUMMER20` — 20% off (min cart value 100)

---

## How to Use

### 1️⃣ First Time Setup

```bash
cd backend

# Install dependencies
npm install

# Push Prisma schema to database (non-destructive)
npm run db:push

# Run the seed script
npm run seed
```

### 2️⃣ Run Seed Anytime

```bash
npm run seed
```

The seed script uses non-destructive `findFirst`/`create` and `upsert` operations:
- ✅ Safe to run multiple times
- ✅ Won't create duplicates
- ✅ Preserves existing customer, order, and product data

---

## Login After Seeding

Use any of the seeded business role credentials to test login and authorization:

```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@store.com",
    "password": "admin123"
  }'
```

---

## Environment & Security Requirements

Configure `backend/.env` using your own environment variables (see `.env.example` if available). Never commit `.env` files or expose real secrets:

```env
DATABASE_URL="<your-mongodb-connection-uri>"
JWT_SECRET="<your-strong-jwt-secret>"
SUPABASE_URL="<your-supabase-project-url>"
SUPABASE_SERVICE_ROLE_KEY="<your-supabase-service-role-key>"
```
