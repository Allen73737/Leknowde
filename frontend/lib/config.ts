export const API_BASE = (
  process.env.LEKNOWDE_API_URL ??
  process.env.API_URL ??
  "http://localhost:8080"
).replace(/\/+$/, "");

export const SESSION_COOKIE = "lk_session";
export const SESSION_MAX_AGE = 60 * 60 * 12;

export const APP_NAME = "LeKnowde";
export const APP_TAGLINE = "Learn the Code. Know the System.";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
