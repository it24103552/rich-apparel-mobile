# Rich Life Apparel — E-Commerce Web Application

Full-stack apparel e-commerce and management platform built with **React + Vite** (Frontend), **Node.js + Express + Prisma** (Backend), **MongoDB Atlas** (`rich-apparel`), and **Supabase Storage**.

---

## Roles & Authorization

The application enforces role-based access control (RBAC) across both frontend routes and backend API middleware with three business roles:

### `ADMIN` (`Admin`)
- Full system administration access.
- Accesses the Overall Admin Dashboard, Products, Collections/Categories, Suppliers, Orders, Payments, Returns, Coupons, Loyalty, Reviews, Customer Support Chat, Customers, Staff, and Roles.

### `PRODUCT_MANAGER` (`Product Manager`)
- Manage products, product collections/categories (`Women`, `Men`, `Sporty`), barcode printing, and product-related inventory/restock operations.

### `SUPPLIER_MANAGER` (`Supplier Manager`)
- Manage suppliers and supplier-related product/restock fulfillment operations.

*(Public storefront users register under the `Customer` role.)*

---

## Product Collections (Categories)

Products are organized into three apparel collections linked through the Prisma `Product -> Category` (`categoryId`) relationship:

1. **Women** (`/category/women`) — Dresses, tops, and women's apparel collections
2. **Men** (`/category/men`) — Shirts, t-shirts, trousers, and men's essentials
3. **Sporty** (`/category/sporty`) — Performance activewear, gym wear, and athletic apparel

---

## Development / Demo Credentials vs. Production Security

### Development / Demo Credentials (Seeded via `backend/prisma/seed.js`)

| Role | Email | Demo Password |
|---|---|---|
| **ADMIN** (`Admin`) | `admin@store.com` | `admin123` |
| **PRODUCT_MANAGER** (`Product Manager`) | `product@shop.com` | `admin123` |
| **SUPPLIER_MANAGER** (`Supplier Manager`) | `supplier@shop.com` | `admin123` |

*(If seeded via `node backend/seedRoles.js`, `admin@shop.com`, `product@shop.com`, and `supplier@shop.com` use demo password `Password123!`.)*

### Production Security Requirements
- Demo credentials are intended **only** for local development and testing.
- In production, disable or remove demo accounts, enforce strong unique passwords, and configure all secrets (`DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) strictly via secure environment variables. Never commit `.env` files or real credentials to source control.
