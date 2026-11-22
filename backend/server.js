const app = require("./src/app");

const PORT = process.env.PORT || 5001;

// Startup environment sanity checks (never log secret values)
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variable(s): ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

if (
  process.env.NODE_ENV === "production" &&
  !process.env.CORS_ALLOWED_ORIGINS &&
  !process.env.FRONTEND_URL
) {
  console.warn("⚠️  Production mode: configure CORS_ALLOWED_ORIGINS or FRONTEND_URL for browser clients.");
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
  console.log(`📚 API Base Path: /api/v1`);
});
