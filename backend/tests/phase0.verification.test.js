const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "phase0_test_secret_key_for_verification_only_32chars";
process.env.JWT_REFRESH_SECRET = "phase0_test_refresh_secret_for_verification_only";
process.env.NODE_ENV = "test";
process.env.API_BASE_URL = "https://api.richapparel.test";

// Pre-seed Prisma module cache with an in-memory stateful mock so tests exercise
// the real Express app, real middlewares, real Zod validators, real controllers,
// and real services without touching or modifying production/dev MongoDB data.
const prismaPath = require.resolve("../src/config/prisma");
const mailerPath = require.resolve("../src/config/mailer");

const IDS = {
  adminRole: "65f000000000000000000001",
  pmRole: "65f000000000000000000002",
  smRole: "65f000000000000000000003",
  custRole: "65f000000000000000000004",
  adminUser: "65f100000000000000000001",
  pmUser: "65f100000000000000000002",
  smUser: "65f100000000000000000003",
  custA: "65f100000000000000000004",
  custB: "65f100000000000000000005",
  deletedUser: "65f100000000000000000006",
  catWomen: "65f200000000000000000001",
  catMen: "65f200000000000000000002",
  prodShirt: "65f300000000000000000001",
  prodJacket: "65f300000000000000000002",
  prodInactive: "65f300000000000000000003",
  cartA: "65f400000000000000000001",
  cartB: "65f400000000000000000002",
  cartItemB: "65f410000000000000000002",
  orderB: "65f500000000000000000002",
  paymentB: "65f600000000000000000002",
  returnB: "65f700000000000000000002",
  coupon10: "65f800000000000000000001",
  supplier1: "65f900000000000000000001",
};

let db;

const resetDb = () => {
  db = {
    roles: [
      { id: IDS.adminRole, name: "Admin", isDeleted: false },
      { id: IDS.pmRole, name: "Product Manager", isDeleted: false },
      { id: IDS.smRole, name: "Supplier Manager", isDeleted: false },
      { id: IDS.custRole, name: "Customer", isDeleted: false },
    ],
    users: [
      {
        id: IDS.adminUser,
        name: "Super Admin",
        email: "admin@shop.com",
        phone: "0770000001",
        password: "$2b$10$hashedpasswordshouldneverleak",
        roleId: IDS.adminRole,
        role: { id: IDS.adminRole, name: "Admin" },
        isDeleted: false,
        createdAt: new Date("2025-01-01T00:00:00Z"),
      },
      {
        id: IDS.pmUser,
        name: "Prod Manager",
        email: "product@shop.com",
        phone: "0770000002",
        password: "$2b$10$hashedpasswordshouldneverleak",
        roleId: IDS.pmRole,
        role: { id: IDS.pmRole, name: "Product Manager" },
        isDeleted: false,
        createdAt: new Date("2025-01-01T00:00:00Z"),
      },
      {
        id: IDS.smUser,
        name: "Supp Manager",
        email: "supplier@shop.com",
        phone: "0770000003",
        password: "$2b$10$hashedpasswordshouldneverleak",
        roleId: IDS.smRole,
        role: { id: IDS.smRole, name: "Supplier Manager" },
        isDeleted: false,
        createdAt: new Date("2025-01-01T00:00:00Z"),
      },
      {
        id: IDS.custA,
        name: "Customer A",
        email: "a@customer.com",
        phone: "0771111111",
        password: "$2b$10$hashedpasswordshouldneverleak",
        roleId: IDS.custRole,
        role: { id: IDS.custRole, name: "Customer" },
        isDeleted: false,
        createdAt: new Date("2025-01-02T00:00:00Z"),
      },
      {
        id: IDS.custB,
        name: "Customer B",
        email: "b@customer.com",
        phone: "0772222222",
        password: "$2b$10$hashedpasswordshouldneverleak",
        roleId: IDS.custRole,
        role: { id: IDS.custRole, name: "Customer" },
        isDeleted: false,
        createdAt: new Date("2025-01-03T00:00:00Z"),
      },
      {
        id: IDS.deletedUser,
        name: "Deleted User",
        email: "deleted@customer.com",
        phone: "0779999999",
        password: "$2b$10$hashedpasswordshouldneverleak",
        roleId: IDS.custRole,
        role: { id: IDS.custRole, name: "Customer" },
        isDeleted: true,
        createdAt: new Date("2025-01-03T00:00:00Z"),
      },
    ],
    categories: [
      { id: IDS.catWomen, name: "Women Dresses", isActive: true, isDeleted: false, createdAt: new Date() },
      { id: IDS.catMen, name: "Men Shirts", isActive: true, isDeleted: false, createdAt: new Date() },
    ],
    suppliers: [
      {
        id: IDS.supplier1,
        name: "Secret Mill Ltd",
        email: "secret@mill.com",
        phone: "0112345678",
        paymentInfo: "BANK-SECRET-999",
        products: [],
      },
    ],
    products: [
      {
        id: IDS.prodShirt,
        name: "Classic Linen Shirt",
        sku: "CLS-001",
        costPrice: 1200,
        description: "Breathable linen shirt for everyday wear.",
        price: 3500,
        stock: 10,
        imageUrl: "/uploads/shirt.jpg",
        images: ["/uploads/shirt.jpg"],
        variants: null,
        isActive: true,
        isDeleted: false,
        categoryId: IDS.catMen,
        supplierId: IDS.supplier1,
        createdAt: new Date("2025-02-01T00:00:00Z"),
      },
      {
        id: IDS.prodJacket,
        name: "Editorial Trench Jacket",
        sku: "ETJ-002",
        costPrice: 4500,
        description: "Tailored trench jacket.",
        price: 12000,
        stock: 5,
        imageUrl: "https://cdn.example.com/jacket.jpg",
        images: ["https://cdn.example.com/jacket.jpg"],
        variants: null,
        isActive: true,
        isDeleted: false,
        categoryId: IDS.catWomen,
        supplierId: IDS.supplier1,
        createdAt: new Date("2025-02-05T00:00:00Z"),
      },
      {
        id: IDS.prodInactive,
        name: "Archived Prototype Coat",
        sku: "APC-003",
        costPrice: 5000,
        description: "Not for sale.",
        price: 9000,
        stock: 20,
        imageUrl: "/uploads/coat.jpg",
        images: [],
        variants: null,
        isActive: false,
        isDeleted: false,
        categoryId: IDS.catWomen,
        supplierId: IDS.supplier1,
        createdAt: new Date("2025-01-15T00:00:00Z"),
      },
    ],
    carts: [
      { id: IDS.cartA, userId: IDS.custA },
      { id: IDS.cartB, userId: IDS.custB },
    ],
    cartItems: [
      { id: IDS.cartItemB, cartId: IDS.cartB, productId: IDS.prodShirt, quantity: 2, variantAttributes: null },
    ],
    orders: [
      {
        id: IDS.orderB,
        userId: IDS.custB,
        status: "pending",
        total: 3850,
        shippingFee: 350,
        address: "123 Galle Road, Colombo 03",
        contactNumber: "0772222222",
        contactEmail: "b@customer.com",
        deliveryMethod: "standard_delivery",
        method: "cash_on_delivery",
        createdAt: new Date("2025-02-10T00:00:00Z"),
        isUpdatedByUser: false,
        isDeleted: false,
        items: [{ id: "65f510000000000000000001", orderId: IDS.orderB, productId: IDS.prodShirt, quantity: 1, price: 3500 }],
      },
    ],
    payments: [
      {
        id: IDS.paymentB,
        orderId: IDS.orderB,
        amount: 3850,
        method: "cash_on_delivery",
        proofImageUrl: null,
        status: "pending",
        createdAt: new Date("2025-02-10T00:00:00Z"),
      },
    ],
    returns: [
      {
        id: IDS.returnB,
        orderId: IDS.orderB,
        reason: "Size mismatch on delivery",
        status: "pending",
        items: [],
        createdAt: new Date(),
      },
    ],
    coupons: [
      {
        id: IDS.coupon10,
        code: "SAVE10",
        discount: 10,
        discountType: "percentage",
        minCartValue: 2000,
        firstOrder: false,
        targetType: "all",
        targetCategoryIds: [],
        targetProductIds: [],
        audienceType: "all",
        audienceUserIds: [IDS.custB],
        isDeleted: false,
      },
    ],
    orderDiscounts: [],
    loyaltyTransactions: [{ id: "65fa00000000000000000001", userId: IDS.custA, points: 500, type: "earned", createdAt: new Date() }],
    notifications: [{ id: "65fb00000000000000000001", type: "NEW_ORDER", title: "Order", message: "Test", isRead: false, createdAt: new Date() }],
    activities: [],
    reviews: [],
  };
};

const applySelect = (obj, select) => {
  if (!obj) return null;
  if (!select) return { ...obj };
  const out = {};
  for (const [k, v] of Object.entries(select)) {
    if (!v) continue;
    if (typeof v === "object" && v.select && obj[k] && typeof obj[k] === "object") {
      out[k] = Array.isArray(obj[k])
        ? obj[k].map((item) => applySelect(item, v.select))
        : applySelect(obj[k], v.select);
    } else {
      out[k] = obj[k];
    }
  }
  return out;
};

let seq = 100;
const nextObjectId = () => `65ff0000000000000000${String(++seq).padStart(4, "0")}`;

const createPrismaMock = () => {
  const mock = {
    $transaction: async (fn) => fn(mock),
    user: {
      findUnique: async ({ where, select, include }) => {
        const u = db.users.find((x) => (where.id ? x.id === where.id : x.email === where.email));
        if (!u) return null;
        return select ? applySelect(u, select) : { ...u };
      },
      findFirst: async ({ where, select }) => {
        const u = db.users.find((x) => {
          if (where?.email?.equals) {
            if (x.email.toLowerCase() !== where.email.equals.toLowerCase()) return false;
          }
          if (where?.isDeleted !== undefined && x.isDeleted !== where.isDeleted) return false;
          return true;
        });
        if (!u) return null;
        return select ? applySelect(u, select) : { ...u };
      },
      findMany: async ({ select }) =>
        db.users.filter((u) => !u.isDeleted).map((u) => (select ? applySelect(u, select) : { ...u })),
      count: async () => db.users.filter((u) => !u.isDeleted).length,
      update: async ({ where, data, select }) => {
        const u = db.users.find((x) => x.id === where.id);
        Object.assign(u, data);
        return select ? applySelect(u, select) : { ...u };
      },
    },
    role: {
      findMany: async () => db.roles.filter((r) => !r.isDeleted),
      findUnique: async ({ where }) => db.roles.find((r) => r.id === where.id) || null,
      count: async () => db.roles.filter((r) => !r.isDeleted).length,
    },
    supplier: {
      findMany: async () => db.suppliers,
      findUnique: async ({ where }) => db.suppliers.find((s) => s.id === where.id) || null,
      count: async () => db.suppliers.length,
    },
    product: {
      findUnique: async ({ where, select, include }) => {
        const p = db.products.find((x) => x.id === where.id);
        if (!p) return null;
        const enriched = {
          ...p,
          category: db.categories.find((c) => c.id === p.categoryId) || null,
          supplier: db.suppliers.find((s) => s.id === p.supplierId) || null,
          reviews: db.reviews.filter((r) => r.productId === p.id && !r.isDeleted),
        };
        return select ? applySelect(enriched, select) : enriched;
      },
      findMany: async ({ where = {}, select, skip = 0, take = 20, orderBy } = {}) => {
        const matchWhere = (p, w) => {
          if (!w) return true;
          if (w.AND) return w.AND.every((c) => matchWhere(p, c));
          if (w.OR) return w.OR.some((c) => matchWhere(p, c));
          if (w.NOT) return !matchWhere(p, w.NOT);
          if (w.id?.in && !w.id.in.includes(p.id)) return false;
          if (w.isDeleted !== undefined && p.isDeleted !== w.isDeleted) return false;
          if (w.isActive !== undefined && p.isActive !== w.isActive) return false;
          if (w.categoryId && p.categoryId !== w.categoryId) return false;
          if (w.stock?.gt !== undefined && !(p.stock > w.stock.gt)) return false;
          if (w.price?.gte !== undefined && !(p.price >= w.price.gte)) return false;
          if (w.price?.lte !== undefined && !(p.price <= w.price.lte)) return false;
          if (w.name?.contains && !p.name.toLowerCase().includes(w.name.contains.toLowerCase())) return false;
          if (w.description?.contains && !p.description.toLowerCase().includes(w.description.contains.toLowerCase())) return false;
          if (w.sku?.contains && !(p.sku || "").toLowerCase().includes(w.sku.contains.toLowerCase())) return false;
          if (w.category) {
            const cat = db.categories.find((c) => c.id === p.categoryId);
            if (!cat) return false;
            if (w.category.name?.contains && !cat.name.toLowerCase().includes(w.category.name.contains.toLowerCase())) return false;
            if (w.category.isDeleted !== undefined && cat.isDeleted !== w.category.isDeleted) return false;
          }
          return true;
        };

        let list = db.products.filter((p) => matchWhere(p, where)).map((p) => ({
          ...p,
          category: db.categories.find((c) => c.id === p.categoryId) || null,
          supplier: db.suppliers.find((s) => s.id === p.supplierId) || null,
          reviews: db.reviews.filter((r) => r.productId === p.id && !r.isDeleted),
        }));

        if (orderBy?.price === "asc") list.sort((a, b) => a.price - b.price);
        else if (orderBy?.price === "desc") list.sort((a, b) => b.price - a.price);
        else if (orderBy?.createdAt === "desc") list.sort((a, b) => b.createdAt - a.createdAt);

        list = list.slice(skip, skip + take);
        return list.map((p) => (select ? applySelect(p, select) : p));
      },
      count: async ({ where = {} } = {}) => (await mock.product.findMany({ where, skip: 0, take: 1000 })).length,
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const p of db.products) {
          if (p.id === where.id && !p.isDeleted && p.isActive !== false && p.stock >= where.stock.gte) {
            if (data.stock?.decrement) p.stock -= data.stock.decrement;
            count += 1;
          }
        }
        return { count };
      },
      update: async ({ where, data }) => {
        const p = db.products.find((x) => x.id === where.id);
        Object.assign(p, data);
        return { ...p };
      },
    },
    cart: {
      findUnique: async ({ where }) => {
        const c = db.carts.find((x) => x.userId === where.userId);
        if (!c) return null;
        return {
          ...c,
          items: db.cartItems
            .filter((i) => i.cartId === c.id)
            .map((i) => ({ ...i, product: db.products.find((p) => p.id === i.productId) })),
        };
      },
      create: async ({ data }) => {
        const c = { id: nextObjectId(), ...data };
        db.carts.push(c);
        return c;
      },
    },
    cartItem: {
      findUnique: async ({ where }) => {
        const item = db.cartItems.find((i) => i.id === where.id);
        if (!item) return null;
        return {
          ...item,
          cart: db.carts.find((c) => c.id === item.cartId) || null,
          product: db.products.find((p) => p.id === item.productId) || null,
        };
      },
      findFirst: async () => null,
      create: async ({ data }) => {
        const item = { id: nextObjectId(), ...data };
        db.cartItems.push(item);
        return item;
      },
      update: async ({ where, data }) => {
        const item = db.cartItems.find((i) => i.id === where.id);
        Object.assign(item, data);
        return item;
      },
      delete: async ({ where }) => {
        const idx = db.cartItems.findIndex((i) => i.id === where.id);
        return db.cartItems.splice(idx, 1)[0];
      },
      deleteMany: async ({ where }) => {
        const cart = db.carts.find((c) => c.userId === where?.cart?.userId);
        if (cart) db.cartItems = db.cartItems.filter((i) => i.cartId !== cart.id);
        return { count: 0 };
      },
    },
    order: {
      create: async ({ data }) => {
        const id = nextObjectId();
        const items = (data.items?.createMany?.data || []).map((it) => ({
          id: nextObjectId(),
          orderId: id,
          ...it,
        }));
        const order = {
          id,
          userId: data.userId,
          status: data.status,
          total: data.total,
          shippingFee: data.shippingFee,
          address: data.address,
          contactNumber: data.contactNumber,
          contactEmail: data.contactEmail,
          deliveryMethod: data.deliveryMethod,
          method: data.method,
          createdAt: new Date(),
          isUpdatedByUser: false,
          isDeleted: false,
          items,
        };
        db.orders.push(order);
        return order;
      },
      findUnique: async ({ where }) => {
        const o = db.orders.find((x) => x.id === where.id);
        if (!o) return null;
        const user = db.users.find((u) => u.id === o.userId);
        return {
          ...o,
          user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
          items: o.items.map((it) => ({ ...it, product: db.products.find((p) => p.id === it.productId) })),
          payment: db.payments.find((pay) => pay.orderId === o.id) || null,
          orderDiscount: db.orderDiscounts.find((d) => d.orderId === o.id) || null,
          returns: db.returns.filter((r) => r.orderId === o.id),
        };
      },
      findMany: async ({ where = {}, skip = 0, take = 10 }) => {
        let list = db.orders.filter((o) => !o.isDeleted && (!where.userId || o.userId === where.userId));
        return list.slice(skip, skip + take).map((o) => ({
          ...o,
          user: applySelect(db.users.find((u) => u.id === o.userId), { id: true, name: true, email: true, phone: true }),
          payment: db.payments.find((pay) => pay.orderId === o.id) || null,
          orderDiscount: db.orderDiscounts.find((d) => d.orderId === o.id) || null,
        }));
      },
      count: async ({ where = {} } = {}) =>
        db.orders.filter(
          (o) =>
            !o.isDeleted &&
            (!where.userId || o.userId === where.userId) &&
            (!where.status?.not || o.status !== where.status.not)
        ).length,
      update: async ({ where, data }) => {
        const o = db.orders.find((x) => x.id === where.id);
        if (data.payment?.update) {
          const pay = db.payments.find((p) => p.orderId === o.id);
          if (pay) Object.assign(pay, data.payment.update);
        }
        const { payment, ...rest } = data;
        Object.assign(o, rest);
        return mock.order.findUnique({ where: { id: o.id } });
      },
    },
    orderDiscount: {
      create: async ({ data }) => {
        const d = { id: nextObjectId(), ...data };
        db.orderDiscounts.push(d);
        return d;
      },
      findUnique: async ({ where }) => db.orderDiscounts.find((d) => d.orderId === where.orderId) || null,
      count: async ({ where }) =>
        db.orderDiscounts.filter((d) => {
          if (where.couponId && d.couponId !== where.couponId) return false;
          const o = db.orders.find((x) => x.id === d.orderId);
          if (!o || o.isDeleted) return false;
          if (where.order?.userId && o.userId !== where.order.userId) return false;
          if (where.order?.status?.not && o.status === where.order.status.not) return false;
          return true;
        }).length,
    },
    payment: {
      create: async ({ data }) => {
        const p = { id: nextObjectId(), createdAt: new Date(), ...data };
        db.payments.push(p);
        return { ...p, order: db.orders.find((o) => o.id === p.orderId) };
      },
      findUnique: async ({ where }) => {
        const p = db.payments.find((x) => x.id === where.id);
        if (!p) return null;
        return { ...p, order: db.orders.find((o) => o.id === p.orderId) };
      },
      findMany: async () => db.payments,
      count: async () => db.payments.length,
      update: async ({ where, data }) => {
        const p = db.payments.find((x) => x.id === where.id);
        Object.assign(p, data);
        return { ...p, order: db.orders.find((o) => o.id === p.orderId) };
      },
    },
    return: {
      findUnique: async ({ where }) => {
        const r = db.returns.find((x) => x.id === where.id);
        if (!r) return null;
        return { ...r, order: db.orders.find((o) => o.id === r.orderId) };
      },
    },
    coupon: {
      findFirst: async ({ where }) =>
        db.coupons.find((c) => c.code === where.code && !c.isDeleted) || null,
      findUnique: async ({ where }) =>
        db.coupons.find((c) => (where.id ? c.id === where.id : c.code === where.code)) || null,
    },
    loyaltyTransaction: {
      aggregate: async ({ where }) => ({
        _sum: {
          points: db.loyaltyTransactions
            .filter((t) => t.userId === where.userId)
            .reduce((s, t) => s + t.points, 0),
        },
      }),
      findFirst: async ({ where }) =>
        db.loyaltyTransactions.find(
          (t) => t.userId === where.userId && t.orderId === where.orderId && t.type === where.type
        ) || null,
      create: async ({ data }) => {
        const tx = { id: nextObjectId(), createdAt: new Date(), ...data };
        db.loyaltyTransactions.push(tx);
        return { ...tx, user: db.users.find((u) => u.id === data.userId) };
      },
    },
    notification: {
      create: async ({ data }) => {
        const n = { id: nextObjectId(), isRead: false, createdAt: new Date(), ...data };
        db.notifications.push(n);
        return n;
      },
      findFirst: async () => null,
      findMany: async () => db.notifications,
    },
    activity: {
      create: async ({ data }) => {
        const a = { id: nextObjectId(), createdAt: new Date(), ...data };
        db.activities.push(a);
        return a;
      },
    },
  };
  return mock;
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: createPrismaMock() };
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendEmail: async () => true } };

const app = require("../src/app");

let server;
let baseUrl;

const makeToken = (user, overrides = {}) =>
  jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role?.name, type: "access", ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: overrides.expiresIn || "1h" }
  );

const reqJson = (method, path, { token, body, headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const url = new URL(path, baseUrl);
    const req = http.request(
      url,
      {
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: token.startsWith("RAW:") ? token.slice(4) : `Bearer ${token}` } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });

describe("Phase 0: Backend Hardening & Mobile Readiness Verification", () => {
  before(async () => {
    resetDb();
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    resetDb();
  });

  // ── 0.1 SECURITY, AUTHENTICATION, RBAC & IDOR ──────────────────────────────
  describe("0.1 Security, Auth, Authorization & IDOR", () => {
    it("rejects missing, malformed, invalid, expired, refresh-as-access, and deleted-user tokens with 401", async () => {
      const noToken = await reqJson("GET", "/api/v1/auth/me");
      assert.equal(noToken.status, 401);
      assert.equal(noToken.body.success, false);
      assert.equal(noToken.body.errorCode, "AUTH_REQUIRED");

      const malformed = await reqJson("GET", "/api/v1/auth/me", { token: "RAW:Token abc" });
      assert.equal(malformed.status, 401);
      assert.equal(malformed.body.errorCode, "INVALID_AUTH_HEADER");

      const invalid = await reqJson("GET", "/api/v1/auth/me", { token: "not.a.jwt" });
      assert.equal(invalid.status, 401);
      assert.equal(invalid.body.errorCode, "INVALID_TOKEN");

      const expired = jwt.sign({ id: IDS.custA, role: "Customer", type: "access" }, process.env.JWT_SECRET, {
        expiresIn: -10,
      });
      const expRes = await reqJson("GET", "/api/v1/auth/me", { token: expired });
      assert.equal(expRes.status, 401);
      assert.equal(expRes.body.errorCode, "TOKEN_EXPIRED");

      const refreshAsAccess = jwt.sign({ id: IDS.custA, type: "refresh" }, process.env.JWT_SECRET, { expiresIn: "1h" });
      const refRes = await reqJson("GET", "/api/v1/auth/me", { token: refreshAsAccess });
      assert.equal(refRes.status, 401);

      const deletedToken = makeToken(db.users.find((u) => u.id === IDS.deletedUser));
      const delRes = await reqJson("GET", "/api/v1/auth/me", { token: deletedToken });
      assert.equal(delRes.status, 401);
      assert.equal(delRes.body.errorCode, "ACCOUNT_INACTIVE");
    });

    it("blocks CUSTOMER from ADMIN, PRODUCT_MANAGER, and SUPPLIER_MANAGER endpoints with 403", async () => {
      const custToken = makeToken(db.users.find((u) => u.id === IDS.custA));

      const checks = [
        ["GET", "/api/v1/users"],
        ["GET", "/api/v1/roles"],
        ["GET", "/api/v1/suppliers"],
        ["GET", "/api/v1/notifications"],
        ["GET", "/api/v1/notifications/pm"],
        ["GET", "/api/v1/notifications/sm"],
        ["GET", "/api/v1/activities"],
        ["GET", "/api/v1/dashboard/overall"],
        ["GET", "/api/v1/products/low-stock"],
        ["PUT", `/api/v1/orders/${IDS.orderB}/status`, { status: "delivered" }],
        ["GET", `/api/v1/coupons/${IDS.coupon10}`],
      ];

      for (const [method, path, body] of checks) {
        const res = await reqJson(method, path, { token: custToken, body });
        assert.equal(res.status, 403, `Expected 403 for CUSTOMER -> ${method} ${path}, got ${res.status}`);
        assert.equal(res.body.success, false);
        assert.equal(res.body.errorCode, "FORBIDDEN");
      }
    });

    it("blocks IDOR: Customer A cannot read/modify Customer B orders, payments, cart, profile, or returns", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));

      assert.equal((await reqJson("GET", `/api/v1/orders/${IDS.orderB}`, { token: custAToken })).status, 403);
      assert.equal((await reqJson("GET", `/api/v1/orders/${IDS.orderB}/discount`, { token: custAToken })).status, 403);
      assert.equal((await reqJson("GET", `/api/v1/payments/${IDS.paymentB}`, { token: custAToken })).status, 403);
      assert.equal((await reqJson("GET", `/api/v1/users/${IDS.custB}`, { token: custAToken })).status, 403);
      assert.equal((await reqJson("GET", `/api/v1/returns/${IDS.returnB}`, { token: custAToken })).status, 403);
      assert.equal(
        (await reqJson("PUT", `/api/v1/cart/${IDS.cartItemB}`, { token: custAToken, body: { quantity: 1 } })).status,
        403
      );
      assert.equal((await reqJson("DELETE", `/api/v1/cart/${IDS.cartItemB}`, { token: custAToken })).status, 403);
    });

    it("blocks mass assignment (customer elevating own roleId) and strips password hashes from user responses", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));
      const adminToken = makeToken(db.users.find((u) => u.id === IDS.adminUser));

      const escalate = await reqJson("PUT", `/api/v1/users/${IDS.custA}`, {
        token: custAToken,
        body: { name: "Customer A", roleId: IDS.adminRole },
      });
      assert.equal(escalate.status, 403);

      const selfProfile = await reqJson("GET", `/api/v1/users/${IDS.custA}`, { token: custAToken });
      assert.equal(selfProfile.status, 200);
      assert.equal(selfProfile.body.data.password, undefined);

      const allUsers = await reqJson("GET", "/api/v1/users", { token: adminToken });
      assert.equal(allUsers.status, 200);
      for (const u of allUsers.body.data.users) {
        assert.equal(u.password, undefined);
      }
    });

    it("rejects invalid ObjectIds cleanly with 400 INVALID_ID without leaking stack traces", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));
      const res = await reqJson("GET", "/api/v1/orders/not-a-valid-objectid", { token: custAToken });
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, "INVALID_ID");
      assert.equal(res.body.stack, undefined);
    });
  });

  // ── 0.2 PRICING, CHECKOUT, STOCK, COUPON & PAYMENT INTEGRITY ───────────────
  describe("0.2 Pricing & Checkout Integrity", () => {
    it("ignores client-tampered price, total, and shippingFee; calculates authoritatively from DB", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));

      // Attempt to buy 1x Shirt (DB price 3500, subtotal < 10000 => shipping 350, total = 3850)
      // while submitting tampered price=1, shippingFee=0, total=1!
      const res = await reqJson("POST", "/api/v1/orders", {
        token: custAToken,
        body: {
          items: [{ productId: IDS.prodShirt, quantity: 1, price: 1 }],
          total: 1,
          shippingFee: 0,
          address: "42 Marine Drive, Colombo 04",
          contactNumber: "0771111111",
          contactEmail: "a@customer.com",
          deliveryMethod: "standard_delivery",
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.items[0].price, 3500);
      assert.equal(res.body.data.shippingFee, 350);
      assert.equal(res.body.data.total, 3850);
      // Verify stock was deducted atomically (10 -> 9)
      assert.equal(db.products.find((p) => p.id === IDS.prodShirt).stock, 9);
    });

    it("applies authoritative free standard shipping over LKR 10,000 and charges LKR 500 for express, LKR 0 for pickup", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));

      // Jacket is LKR 12,000 (>= 10,000) -> standard_delivery MUST be FREE (0)
      const qStd = await reqJson("POST", "/api/v1/orders/quote", {
        token: custAToken,
        body: { items: [{ productId: IDS.prodJacket, quantity: 1 }], deliveryMethod: "standard_delivery" },
      });
      assert.equal(qStd.status, 200);
      assert.equal(qStd.body.data.subtotal, 12000);
      assert.equal(qStd.body.data.shippingFee, 0);
      assert.equal(qStd.body.data.total, 12000);

      // Express delivery is always LKR 500
      const qExp = await reqJson("POST", "/api/v1/orders/quote", {
        token: custAToken,
        body: { items: [{ productId: IDS.prodJacket, quantity: 1 }], deliveryMethod: "express_delivery" },
      });
      assert.equal(qExp.body.data.shippingFee, 500);
      assert.equal(qExp.body.data.total, 12500);

      // Pickup is always LKR 0 even under LKR 10,000
      const qPick = await reqJson("POST", "/api/v1/orders/quote", {
        token: custAToken,
        body: { items: [{ productId: IDS.prodShirt, quantity: 1 }], deliveryMethod: "pickup" },
      });
      assert.equal(qPick.body.data.shippingFee, 0);
      assert.equal(qPick.body.data.total, 3500);
    });

    it("blocks excessive quantity, zero/negative quantity, inactive products, and nonexistent products", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));
      const base = {
        address: "42 Marine Drive, Colombo 04",
        contactNumber: "0771111111",
        contactEmail: "a@customer.com",
        deliveryMethod: "pickup",
      };

      // Quantity > stock (stock is 10)
      const overStock = await reqJson("POST", "/api/v1/orders", {
        token: custAToken,
        body: { ...base, items: [{ productId: IDS.prodShirt, quantity: 11 }] },
      });
      assert.equal(overStock.status, 400);
      assert.equal(overStock.body.errorCode, "INSUFFICIENT_STOCK");

      // Duplicate lines summing > stock (6 + 6 = 12 > 10)
      const dupOverStock = await reqJson("POST", "/api/v1/orders", {
        token: custAToken,
        body: {
          ...base,
          items: [
            { productId: IDS.prodShirt, quantity: 6 },
            { productId: IDS.prodShirt, quantity: 6 },
          ],
        },
      });
      assert.equal(dupOverStock.status, 400);
      assert.equal(dupOverStock.body.errorCode, "INSUFFICIENT_STOCK");

      // Quantity <= 0
      const zeroQty = await reqJson("POST", "/api/v1/orders", {
        token: custAToken,
        body: { ...base, items: [{ productId: IDS.prodShirt, quantity: 0 }] },
      });
      assert.equal(zeroQty.status, 400);

      // Inactive product
      const inactive = await reqJson("POST", "/api/v1/orders", {
        token: custAToken,
        body: { ...base, items: [{ productId: IDS.prodInactive, quantity: 1 }] },
      });
      assert.equal(inactive.status, 400);
      assert.equal(inactive.body.errorCode, "PRODUCT_UNAVAILABLE");

      // Nonexistent product
      const missing = await reqJson("POST", "/api/v1/orders", {
        token: custAToken,
        body: { ...base, items: [{ productId: "65f300000000000000009999", quantity: 1 }] },
      });
      assert.equal(missing.status, 400);
      assert.equal(missing.body.errorCode, "PRODUCT_NOT_FOUND");
    });

    it("enforces server-side payment integrity: blocks card, ignores tampered amount & status='paid'", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));

      // Create valid order first (total = 3500 + 350 = 3850)
      const orderRes = await reqJson("POST", "/api/v1/orders", {
        token: custAToken,
        body: {
          items: [{ productId: IDS.prodShirt, quantity: 1 }],
          address: "42 Marine Drive, Colombo 04",
          contactNumber: "0771111111",
          contactEmail: "a@customer.com",
          deliveryMethod: "standard_delivery",
        },
      });
      const orderId = orderRes.body.data.id;

      // Reject mock card payment
      const cardRes = await reqJson("POST", "/api/v1/payments", {
        token: custAToken,
        body: { orderId, method: "card", amount: 1, status: "paid" },
      });
      assert.equal(cardRes.status, 400);

      // Submit COD with tampered amount=1 and status="paid" -> backend MUST set amount=3850 & status="pending"
      const codRes = await reqJson("POST", "/api/v1/payments", {
        token: custAToken,
        body: { orderId, method: "cash_on_delivery", amount: 1, status: "paid" },
      });
      assert.equal(codRes.status, 201);
      assert.equal(codRes.body.data.amount, 3850);
      assert.equal(codRes.body.data.status, "pending");
    });

    it("enforces valid order status transitions for admins", async () => {
      const adminToken = makeToken(db.users.find((u) => u.id === IDS.adminUser));

      // Invalid jump: pending -> delivered directly MUST fail
      const badJump = await reqJson("PUT", `/api/v1/orders/${IDS.orderB}/status`, {
        token: adminToken,
        body: { status: "delivered" },
      });
      assert.equal(badJump.status, 400);
      assert.equal(badJump.body.errorCode, "INVALID_STATUS_TRANSITION");

      // Valid: pending -> confirmed
      const okConfirm = await reqJson("PUT", `/api/v1/orders/${IDS.orderB}/status`, {
        token: adminToken,
        body: { status: "confirmed" },
      });
      assert.equal(okConfirm.status, 200);
      assert.equal(okConfirm.body.data.status, "confirmed");
    });
  });

  // ── 0.3 AUTHENTICATION IMPROVEMENTS ────────────────────────────────────────
  describe("0.3 Auth Endpoints (/me, /refresh, /logout)", () => {
    it("returns safe user payload on GET /auth/me and refreshes tokens on POST /auth/refresh", async () => {
      const custAToken = makeToken(db.users.find((u) => u.id === IDS.custA));

      const meRes = await reqJson("GET", "/api/v1/auth/me", { token: custAToken });
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.email, "a@customer.com");
      assert.equal(meRes.body.data.role, "Customer");
      assert.equal(meRes.body.data.password, undefined);

      const refreshTok = jwt.sign({ id: IDS.custA, type: "refresh" }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: "30d",
      });
      const refRes = await reqJson("POST", "/api/v1/auth/refresh", { body: { refreshToken: refreshTok } });
      assert.equal(refRes.status, 200);
      assert.ok(refRes.body.data.token);
      assert.ok(refRes.body.data.refreshToken);
      assert.equal(refRes.body.data.user.password, undefined);

      const logoutRes = await reqJson("POST", "/api/v1/auth/logout", { token: custAToken });
      assert.equal(logoutRes.status, 200);
    });
  });

  // ── 0.4 CATALOG API, PAGINATION, FILTERING & RESPONSE SANITIZATION ─────────
  describe("0.4 Catalog API & Response Sanitization", () => {
    it("supports page/limit pagination, search, price filter, sort, absolute media URLs, and hides supplier/costPrice publicly", async () => {
      const pubRes = await reqJson("GET", "/api/v1/products?page=1&limit=2&activeOnly=true&sort=price_desc");
      assert.equal(pubRes.status, 200);
      assert.equal(pubRes.body.data.pagination.page, 1);
      assert.equal(pubRes.body.data.pagination.limit, 2);
      assert.equal(pubRes.body.data.products.length, 2);
      assert.equal(pubRes.body.data.products[0].price, 12000);
      assert.equal(pubRes.body.data.products[1].price, 3500);

      // Public response MUST NOT leak costPrice or supplier details
      assert.equal(pubRes.body.data.products[0].costPrice, undefined);
      assert.equal(pubRes.body.data.products[0].supplier, undefined);

      // Relative /uploads/... image normalized to absolute URL for mobile clients
      assert.equal(pubRes.body.data.products[1].imageUrl, "https://api.richapparel.test/uploads/shirt.jpg");

      // Invalid sort rejected cleanly
      const badSort = await reqJson("GET", "/api/v1/products?sort=DROP_TABLE");
      assert.equal(badSort.status, 400);
      assert.equal(badSort.body.errorCode, "INVALID_SORT");
    });
  });

  // ── 0.5 & 0.6 CORS & SECURITY HEADERS ──────────────────────────────────────
  describe("0.5 & 0.6 Security Headers & CORS", () => {
    it("sets security headers and enforces CORS origin allowlist", async () => {
      const health = await reqJson("GET", "/health");
      assert.equal(health.status, 200);
      assert.equal(health.headers["x-content-type-options"], "nosniff");
      assert.equal(health.headers["x-frame-options"], "DENY");
      assert.equal(health.headers["x-powered-by"], undefined);

      // Blocked untrusted browser origin
      const evilCors = await reqJson("GET", "/health", { headers: { Origin: "https://evil.example.com" } });
      assert.equal(evilCors.status, 403);
      assert.equal(evilCors.body.errorCode, "CORS_FORBIDDEN");
    });
  });
});
