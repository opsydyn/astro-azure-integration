import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const exampleDir = join(process.cwd(), "examples/basic");
const distDir = join(exampleDir, "dist");

beforeEach(async () => {
  await rm(distDir, { recursive: true, force: true });
});

describe("basic Astro example build", () => {
  it("builds the app and emits Azure SWA files", async () => {
    await execFileAsync(process.execPath, ["run", "build"], {
      cwd: exampleDir,
    });

    expect(existsSync(join(distDir, "client"))).toBe(true);
    expect(existsSync(join(distDir, "api/host.json"))).toBe(true);
    expect(existsSync(join(distDir, "api/package.json"))).toBe(true);
    expect(existsSync(join(distDir, "api/server/index.mjs"))).toBe(true);
    expect(existsSync(join(distDir, "api/server/chunks"))).toBe(true);
    expect(existsSync(join(distDir, "staticwebapp.config.json"))).toBe(true);

    const config = JSON.parse(
      await readFile(join(distDir, "staticwebapp.config.json"), "utf8"),
    );

    expect(config.navigationFallback.rewrite).toBe("/api/server");
    expect(config.routes[0].route).toBe("/_astro/*");

    const entrypoint = await readFile(
      join(distDir, "api/server/index.mjs"),
      "utf8",
    );

    expect(entrypoint).toContain('app.http("server"');
    expect(entrypoint).toContain("deserializeManifest");
  });
});
