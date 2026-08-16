import { describe, expect, it, vi } from "vitest";

describe("production environment validation", () => {
  it("rejects missing production configuration", async () => {
    const original = { ...process.env };
    process.env.DATABASE_URL = "mysql://localhost/dbops";
    process.env.JWT_SECRET = "short-secret";
    process.env.VITE_APP_ID = "your_manus_oauth_app_id";
    process.env.OAUTH_SERVER_URL = "your_oauth_server_url";
    process.env.BUILT_IN_FORGE_API_URL = "your_frontend_built_in_api_url";
    process.env.BUILT_IN_FORGE_API_KEY = "your_frontend_built_in_api_key";
    process.env.NODE_ENV = "test";
    vi.resetModules();
    const { validateEnvironment } = await import("./_core/env");
    expect(() => validateEnvironment({ production: true })).toThrow(/DATABASE_URL|JWT_SECRET|VITE_APP_ID|OAUTH_SERVER_URL/);
    process.env = original;
  });

  it("accepts a complete production configuration", async () => {
    const original = { ...process.env };
    process.env.DATABASE_URL = "mysql://localhost/dbops";
    process.env.JWT_SECRET = "a".repeat(64);
    process.env.VITE_APP_ID = "oauth-app";
    process.env.OAUTH_SERVER_URL = "https://oauth.example.com";
    process.env.BUILT_IN_FORGE_API_URL = "https://api.openai.com";
    process.env.BUILT_IN_FORGE_API_KEY = "secret-key";
    process.env.NODE_ENV = "test";
    vi.resetModules();
    const { validateEnvironment } = await import("./_core/env");
    expect(validateEnvironment({ production: true })).toBe(true);
    process.env = original;
  });
});

describe("secret payload validation", () => {
  it("rejects malformed encrypted payloads", async () => {
    const { decryptSecret } = await import("./crypto");
    expect(() => decryptSecret("aQ")).toThrow(/Invalid encrypted secret payload/);
  });
});
