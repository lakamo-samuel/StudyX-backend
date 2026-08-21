import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT:     z.string().default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // JWT
  JWT_SECRET:    z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY:    z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),

  // Gemini
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM:     z.string().email("EMAIL_FROM must be a valid email").optional(),

  // Billing (Flutterwave)
  // FLUTTERWAVE_SECRET_KEY  — your API secret key for calling Flutterwave endpoints
  // FLUTTERWAVE_WEBHOOK_SECRET — the "Secret Hash" you set in Flutterwave dashboard → Webhooks
  //   Flutterwave sends this value in the "verif-hash" header on every webhook.
  //   They can be the same value or different — set both in your env.
  FLUTTERWAVE_SECRET_KEY:      z.string().optional(),
  FLUTTERWAVE_WEBHOOK_SECRET:  z.string().optional(),

  // Client
  CLIENT_URL: z.string().url("CLIENT_URL must be a valid URL"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data as z.infer<typeof envSchema>;
