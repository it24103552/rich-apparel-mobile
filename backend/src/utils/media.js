/**
 * Resolves relative uploaded asset paths (e.g. "/uploads/...") into stable
 * absolute URLs usable by both React web and Flutter mobile clients.
 * Cloud URLs (Supabase https://...) pass through unchanged.
 */
const getPublicBaseUrl = (req = null) => {
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/+$/, "");
  }

  if (req && typeof req.get === "function") {
    const host = req.get("host");
    if (host) {
      const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol || "http";
      return `${proto}://${host}`;
    }
  }

  const port = process.env.PORT || 5001;
  return `http://localhost:${port}`;
};

const toAbsoluteMediaUrl = (url, req = null) => {
  if (!url || typeof url !== "string") return url || null;
  if (/^https?:\/\//i.test(url)) return url;
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${getPublicBaseUrl(req)}${cleanPath}`;
};

const normalizeProductMedia = (product, req = null) => {
  if (!product) return product;
  return {
    ...product,
    imageUrl: product.imageUrl ? toAbsoluteMediaUrl(product.imageUrl, req) : product.imageUrl,
    images: Array.isArray(product.images)
      ? product.images.map((img) => toAbsoluteMediaUrl(img, req))
      : [],
  };
};

module.exports = {
  getPublicBaseUrl,
  toAbsoluteMediaUrl,
  normalizeProductMedia,
};
