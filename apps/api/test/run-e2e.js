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
env.DATABASE_URL = env.TEST_DATABASE_URL;

execSync("npx prisma generate", { stdio: "inherit", env });
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("jest --config ./test/jest-e2e.json", { stdio: "inherit", env });
