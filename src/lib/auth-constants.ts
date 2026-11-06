/** Constants shared by the Node server code and the (Edge) middleware. */
export const EDITOR_COOKIE = "bs_editor";
/** Only used outside production when COOKIE_SECRET is unset. */
export const DEV_COOKIE_SECRET = "dev-only-cookie-secret-change-me";

export function cookieSecretFromEnv(env: { COOKIE_SECRET?: string; NODE_ENV?: string }): string {
  return env.COOKIE_SECRET?.trim() || (env.NODE_ENV === "production" ? "" : DEV_COOKIE_SECRET);
}
