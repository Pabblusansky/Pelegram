import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const IS_PROD = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters long'),
  MONGO_URI: z.string().min(1).default('mongodb://localhost:27017/Pelegram'),
  // The API answers cross-origin requests with Access-Control-Allow-Credentials,
  // so the origin has to be a concrete one. '*' would either be rejected by the
  // browser or, with credentials dropped, hand every site read access.
  CORS_ORIGIN: z.string().min(1).refine(
    (value) => value !== '*',
    'CORS_ORIGIN must name a concrete origin, not "*", because credentials are allowed',
  ).default('http://localhost:4200'),
  BASE_URL: z.string().min(1).default('http://localhost:3000'),
  // Number of reverse proxies in front of the app. Defaults to 0: trusting
  // X-Forwarded-For when nothing sets it lets any client spoof its source
  // address and rotate it per request, which defeats the auth rate limiter
  // entirely. Set this only to the real hop count.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  CLOUDINARY_CLOUD_NAME: IS_PROD ? z.string().min(1) : z.string().optional(),
  CLOUDINARY_API_KEY: IS_PROD ? z.string().min(1) : z.string().optional(),
  CLOUDINARY_API_SECRET: IS_PROD ? z.string().min(1) : z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  console.error(`\nInvalid environment configuration:\n${details}\n`);
  console.error('See .env.example for the full list of supported variables.\n');
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

export default env;
