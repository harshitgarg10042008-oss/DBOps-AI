import crypto from "node:crypto";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const source = process.env.JWT_SECRET;
  if (!source && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required for production secret encryption");
  }
  return crypto.createHash("sha256").update(source ?? "dbops-ai-development-secret").digest().subarray(0, KEY_LENGTH);
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSecret(payload: string) {
  const raw = Buffer.from(payload, "base64url");
  if (raw.length <= IV_LENGTH + TAG_LENGTH) throw new Error("Invalid encrypted secret payload");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function redactSql(sql: string) {
  return sql.replace(/'(?:''|[^'])*'/g, "'[REDACTED]'");
}
