const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const distDir = path.resolve(__dirname, "dist-packages");
const manifestPath = path.join(distDir, "SHA256SUMS");

function sha256ForFile(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function parseManifest(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
      if (!match) {
        throw new Error(`Invalid checksum line: '${line}'`);
      }
      return {
        expected: match[1].toLowerCase(),
        filename: match[2],
      };
    });
}

function verify() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing checksum manifest: ${manifestPath}`);
  }

  const entries = parseManifest(fs.readFileSync(manifestPath, "utf8"));
  if (entries.length === 0) {
    throw new Error("Checksum manifest is empty.");
  }

  for (const entry of entries) {
    const filePath = path.join(distDir, entry.filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing vendored SDK artifact: ${entry.filename}`);
    }

    const actual = sha256ForFile(filePath);
    if (actual !== entry.expected) {
      throw new Error(
        `Checksum mismatch for ${entry.filename}. Expected ${entry.expected}, got ${actual}.`
      );
    }
  }

  console.log(`Verified ${entries.length} vendored SDK artifact checksums.`);
}

verify();
