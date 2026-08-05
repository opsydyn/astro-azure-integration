import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workflowDir = join(process.cwd(), ".github", "workflows");

async function readWorkflow(name: string): Promise<string> {
  return readFile(join(workflowDir, name), "utf8");
}

function namedStepBlock(source: string, name: string): string {
  const start = source.indexOf("- name: " + name);
  if (start < 0) return "";
  const nextStep = source.indexOf("\n      - name:", start + 1);
  return source.slice(start, nextStep < 0 ? source.length : nextStep);
}

describe("GitHub workflow hardening contract", () => {
  it("defines one pinned reusable quality gate", async () => {
    const quality = await readWorkflow("quality.yml");

    expect(quality).toContain("workflow_call:");
    expect(quality).toContain('bun-version: "1.3.11"');
    expect(quality).toContain("bun install --frozen-lockfile");
    expect(quality).toContain("bun run check");
    expect(quality).toContain("bun run lint");
    expect(quality).toContain("bun run lint:knip");
    expect(quality).toContain("docs:api:check");
    expect(quality).toContain("bun run size");
    expect(quality).toContain("pack:dry-run");
  });

  it("makes CI, release, and Azure upload depend on quality", async () => {
    const ci = await readWorkflow("ci.yml");
    const release = await readWorkflow("release.yml");
    const azure = await readWorkflow("azure-static-web-apps.yml");

    expect(ci).toMatch(
      /quality:\s*\n\s+uses: \.\/\.github\/workflows\/quality\.yml/s,
    );
    expect(release).toMatch(
      /quality:\s*\n\s+uses: \.\/\.github\/workflows\/quality\.yml/s,
    );
    expect(release).toMatch(/release:\s*\n\s+needs: quality/s);
    expect(azure).toMatch(
      /quality:\s*\n(?:\s+if:.*\n)?\s+uses: \.\/\.github\/workflows\/quality\.yml/s,
    );
    expect(azure).toMatch(/build_and_deploy:\s*\n\s+needs: quality/s);
    expect(ci + "\n" + release + "\n" + azure).not.toContain(
      "bun-version: latest",
    );
  });

  it("keeps production out of PR smoke", async () => {
    const azure = await readWorkflow("azure-static-web-apps.yml");
    const smoke = namedStepBlock(azure, "Smoke test deployment");

    expect(azure).toContain("deployments: read");
    expect(azure).toContain("environment_url");
    expect(azure).toMatch(
      /github\.event_name\s*==\s*["']pull_request["']/,
    );
    expect(azure).toContain("SMOKE_BASE_URL");
    expect(smoke).toContain("$SMOKE_BASE_URL/api/health");
    expect(smoke).not.toContain("blue-wave-00d0bf30f.7.azurestaticapps.net");
  });
});
