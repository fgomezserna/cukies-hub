import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const scriptDirectory = resolve(__dirname, "../..");

function runCli(args: string[], environment: Partial<NodeJS.ProcessEnv> = {}) {
  const env = { ...process.env, ...environment };
  delete env.AMBASSADOR_ADMIN_HMAC_KEY_ID;
  delete env.AMBASSADOR_ADMIN_HMAC_SECRET;
  const result = spawnSync("pnpm", ["exec", "tsx", "scripts/ambassadors-admin.ts", ...args], {
    cwd: scriptDirectory,
    env,
    encoding: "utf8",
  });
  return {
    ...result,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("ambassadors-admin CLI", () => {
  it("permite consultar la ayuda sin cargar server-only ni credenciales", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("ambassadors-admin.ts");
    expect(result.output).not.toContain("server-only");
  });

  it("exige la credencial dedicada aunque exista una HMAC economica generica", () => {
    const result = runCli([
      "--base-url", "http://localhost:3000",
      "--referred", "0x1111111111111111111111111111111111111111",
      "--sponsor", "0x2222222222222222222222222222222222222222",
      "--expected-current-sponsor", "none",
      "--reason", "prueba",
      "--idempotency-key", "ambassador-cli-test",
    ], {
      ECONOMY_INTERNAL_HMAC_KEY_ID: "generic-v1",
      ECONOMY_INTERNAL_HMAC_SECRET: "generic-secret-that-must-not-be-used-1234",
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("AMBASSADOR_ADMIN_HMAC_KEY_ID es obligatorio");
  });
});
