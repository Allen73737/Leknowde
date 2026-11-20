export interface Env {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_DAYS: number;
  JWT_ACCESS_SECRET: string;
  REFRESH_TOKEN_PEPPER: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env: Env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: required("DATABASE_URL"),
  ACCESS_TOKEN_TTL_SECONDS: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
  REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  REFRESH_TOKEN_PEPPER: required("REFRESH_TOKEN_PEPPER"),
};

export const isProduction = env.NODE_ENV === "production";
