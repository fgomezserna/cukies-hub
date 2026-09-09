import { createHash, createHmac, randomBytes } from "node:crypto";

const PATH = "/api/economy/v1/internal/ambassadors/sponsor";

function loadAmbassadorAdminAuthConfig() {
  const keyId = process.env.AMBASSADOR_ADMIN_HMAC_KEY_ID?.trim();
  if (!keyId) {
    throw new Error("AMBASSADOR_ADMIN_HMAC_KEY_ID es obligatorio.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId)) {
    throw new Error("AMBASSADOR_ADMIN_HMAC_KEY_ID tiene un formato invalido.");
  }

  const secretText = process.env.AMBASSADOR_ADMIN_HMAC_SECRET?.trim();
  if (!secretText) {
    throw new Error("AMBASSADOR_ADMIN_HMAC_SECRET es obligatorio.");
  }
  const publicSecretReuse = Object.entries(process.env).some(([name, value]) => (
    name.startsWith("NEXT_PUBLIC_")
    && typeof value === "string"
    && value.trim().length > 0
    && secretText === value.trim()
  ));
  if (publicSecretReuse) {
    throw new Error("AMBASSADOR_ADMIN_HMAC_SECRET no puede reutilizar una variable NEXT_PUBLIC_.");
  }
  const secret = Buffer.from(secretText, "utf8");
  if (secret.byteLength < 32) {
    throw new Error("AMBASSADOR_ADMIN_HMAC_SECRET debe tener al menos 32 bytes.");
  }
  return { keyId, secret };
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requiere un valor.`);
  return value;
}

function requiredOption(name: string) {
  const value = option(name);
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function usage() {
  console.error(
    "Uso: pnpm exec tsx dapp/scripts/ambassadors-admin.ts --base-url URL --referred 0x... --sponsor 0x... --expected-current-sponsor 0x...|none --reason TEXTO --idempotency-key CLAVE",
  );
}

async function main() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }
  const baseUrl = requiredOption("--base-url").replace(/\/$/, "");
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== "https:" && !(parsedBaseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsedBaseUrl.hostname))) {
    throw new Error("--base-url debe usar https:// (o http://localhost para operación local).");
  }
  const expected = requiredOption("--expected-current-sponsor");
  const body = JSON.stringify({
    referredWallet: requiredOption("--referred"),
    sponsorWallet: requiredOption("--sponsor"),
    expectedCurrentSponsor: expected.toLowerCase() === "none" || expected.toLowerCase() === "null" ? null : expected,
    reason: requiredOption("--reason"),
    idempotencyKey: requiredOption("--idempotency-key"),
  });
  const config = loadAmbassadorAdminAuthConfig();
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString("base64url");
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const canonicalRequest = [
    "cukies-economy-hmac-v1",
    config.keyId,
    "POST",
    PATH,
    timestamp,
    nonce,
    bodyHash,
  ].join("\n");
  const signature = `v1=${createHmac("sha256", config.secret)
    .update(canonicalRequest, "utf8")
    .digest("hex")}`;
  const response = await fetch(`${baseUrl}${PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      "x-economy-timestamp": timestamp,
      "x-economy-nonce": nonce,
      "x-economy-key-id": config.keyId,
      "x-economy-signature": signature,
    },
    redirect: "manual",
    body,
  });
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep bounded text below */ }
  console.log(JSON.stringify({ httpStatus: response.status, response: parsed }));
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Ambassador admin command failed");
  usage();
  process.exitCode = 1;
});
