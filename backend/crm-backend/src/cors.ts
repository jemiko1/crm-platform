const DEV_ORIGINS = ["http://localhost:3002", "http://localhost:4002"];

export function getCorsOrigins(): string[] {
  const env = process.env.CORS_ORIGINS?.trim();
  if (env) {
    return env.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return DEV_ORIGINS;
}
