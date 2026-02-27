const { execSync } = require("child_process");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const env = { ...process.env };
if (!env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required for E2E. Refusing to run against non-test DB."
  );
}

const defaultHostAllowlist = ["localhost", "127.0.0.1"];
const configuredHostAllowlist = (env.TEST_DATABASE_HOST_ALLOWLIST ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const hostAllowlist =
  configuredHostAllowlist.length > 0
    ? configuredHostAllowlist
    : defaultHostAllowlist;

const parsed = new URL(env.TEST_DATABASE_URL);
if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
  throw new Error(
    `TEST_DATABASE_URL must use postgres protocol. Received: ${parsed.protocol}`
  );
}

const databaseName = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
if (!databaseName || !databaseName.toLowerCase().endsWith("_test")) {
  throw new Error(
    "Unsafe TEST_DATABASE_URL: database name must end with '_test'."
  );
}

const hostname = parsed.hostname.toLowerCase();
if (!hostAllowlist.includes(hostname)) {
  throw new Error(
    `Unsafe TEST_DATABASE_URL host '${hostname}'. Allowed hosts: ${hostAllowlist.join(", ")}`
  );
}

const forbiddenMarkers = ["staging", "prod", "production"];
if (
  forbiddenMarkers.some((marker) =>
    `${hostname}/${databaseName}`.toLowerCase().includes(marker)
  )
) {
  throw new Error(
    "Unsafe TEST_DATABASE_URL: staging/prod marker detected in host or database name."
  );
}

env.DATABASE_URL = env.TEST_DATABASE_URL;

execSync("npx prisma generate", { stdio: "inherit", env });
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("jest --config ./test/jest-e2e.json", { stdio: "inherit", env });
