const PLACEHOLDER_VALUES = new Set([
  "your_manus_oauth_app_id",
  "your_oauth_server_url",
  "your_manus_login_portal_url",
  "your_frontend_built_in_api_url",
  "your_frontend_built_in_api_key",
]);

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerName: process.env.OWNER_NAME ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

function isPlaceholder(value: string) {
  return !value || PLACEHOLDER_VALUES.has(value.trim());
}

export function validateEnvironment({ production = ENV.isProduction } = {}) {
  const errors: string[] = [];
  if (!ENV.databaseUrl) errors.push("DATABASE_URL is required");
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters");
  }
  if (production) {
    if (isPlaceholder(ENV.appId)) errors.push("VITE_APP_ID must be configured in production");
    if (isPlaceholder(ENV.oAuthServerUrl)) errors.push("OAUTH_SERVER_URL must be configured in production");
    if (isPlaceholder(ENV.forgeApiUrl)) errors.push("BUILT_IN_FORGE_API_URL must be configured in production");
    if (isPlaceholder(ENV.forgeApiKey)) errors.push("BUILT_IN_FORGE_API_KEY must be configured in production");
    if (ENV.cookieSecret.length < 48) errors.push("JWT_SECRET should be at least 48 characters in production");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

export function isPlaceholderEnvironmentValue(value: string) {
  return isPlaceholder(value);
}

if (ENV.isProduction) validateEnvironment();
