import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("uploads"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().url().optional().default("http://localhost:4000/api/google-drive/oauth/callback"),
  PUBLIC_API_URL: z.string().url().optional(),
  FACEBOOK_APP_ID: z.string().optional().default(""),
  FACEBOOK_APP_SECRET: z.string().optional().default(""),
  FACEBOOK_REDIRECT_URI: z.string().url().optional().default("http://localhost:4000/api/instagram/oauth/callback"),
  FACEBOOK_GRAPH_API_VERSION: z.string().default("v25.0"),
  FACEBOOK_SCOPES: z
    .string()
    .default(
      "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement"
    ),
  GOOGLE_DRIVE_SCOPES: z
    .string()
    .default(
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/userinfo.email"
    )
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid API environment configuration", parsed.error.flatten());
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  facebookScopes: parsed.data.FACEBOOK_SCOPES.split(/[\s,]+/).filter(Boolean),
  facebookGraphBaseUrl: `https://graph.facebook.com/${parsed.data.FACEBOOK_GRAPH_API_VERSION}`,
  facebookDialogBaseUrl: `https://www.facebook.com/${parsed.data.FACEBOOK_GRAPH_API_VERSION}/dialog/oauth`,
  googleDriveScopes: parsed.data.GOOGLE_DRIVE_SCOPES.split(/\s+/).filter(Boolean),
  geminiConfigured: Boolean(parsed.data.GEMINI_API_KEY) ||
    Object.keys(process.env).some((k) => k.startsWith("GEMINI_API_KEY") && process.env[k]?.trim()),
  googleConfigured: Boolean(parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET),
  facebookConfigured: Boolean(parsed.data.FACEBOOK_APP_ID && parsed.data.FACEBOOK_APP_SECRET)
};
