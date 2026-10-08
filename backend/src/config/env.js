import { z } from "zod";

const csv = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? fallback)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: csv("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_FALLBACK_MODELS: csv("gemini-3.5-flash,gemini-flash-latest,gemini-3.1-flash-lite"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  UPLOAD_DIR: z.string().default("uploads"),
  PUBLIC_URL: z.string().optional().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`\nInvalid environment configuration:\n${issues}\n\nSee backend/.env.example.\n`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  aiEnabled: Boolean(parsed.data.GEMINI_API_KEY),
  cloudinaryEnabled: Boolean(
    parsed.data.CLOUDINARY_CLOUD_NAME && parsed.data.CLOUDINARY_API_KEY && parsed.data.CLOUDINARY_API_SECRET,
  ),
};
