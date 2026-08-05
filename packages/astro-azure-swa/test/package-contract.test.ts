import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));

describe("published runtime contract", () => {
  it("advertises the supported Astro and Node ranges", async () => {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      engines?: { node?: string };
      peerDependencies?: { astro?: string };
    };

    expect(packageJson.engines?.node).toBe(">=20.0.0");
    expect(packageJson.peerDependencies?.astro).toBe("^7.0.0");
  });
});
