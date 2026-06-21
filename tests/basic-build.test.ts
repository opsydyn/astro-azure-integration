import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const exampleDir = join(process.cwd(), "examples/basic");
const distDir = join(exampleDir, "dist");
const bunExecutable = process.env.BUN_INSTALL
  ? join(process.env.BUN_INSTALL, "bin", "bun")
  : "bun";
const previewPort = 4325;
let previewProcess: ChildProcessWithoutNullStreams | undefined;

beforeEach(async () => {
  await rm(distDir, { recursive: true, force: true });
});

afterEach(async () => {
  await stopPreview();
});

describe("basic Astro example build", () => {
  it("builds the high-fidelity app, emits Azure SWA files, and previews key routes", async () => {
    await execFileAsync(bunExecutable, ["run", "build"], {
      cwd: exampleDir,
      env: {
        ...process.env,
        ASTRO_AZURE_SAMPLE_ENV: "build-check",
      },
    });

    expect(existsSync(join(distDir, "client"))).toBe(true);
    expect(existsSync(join(distDir, "api/host.json"))).toBe(true);
    expect(existsSync(join(distDir, "api/package.json"))).toBe(true);
    expect(existsSync(join(distDir, "api/server/index.mjs"))).toBe(true);
    expect(existsSync(join(distDir, "api/server/chunks"))).toBe(true);
    expect(existsSync(join(distDir, "client", "staticwebapp.config.json"))).toBe(true);
    expect(existsSync(join(distDir, "client", "admin", "index.html"))).toBe(true);
    expect(existsSync(join(distDir, "client", "admin", "config.yml"))).toBe(true);

    const config = JSON.parse(
      await readFile(join(distDir, "client", "staticwebapp.config.json"), "utf8"),
    );

    expect(config.routes[0].route).toBe("/_astro/*");
    expect(config.routes[1]).toEqual({
      route: "/",
      rewrite: "/api/server",
    });
    expect(config.navigationFallback).toEqual({
      rewrite: "/api/server",
      exclude: ["/_astro/*"],
    });
    expect(config.platform).toEqual({
      apiRuntime: "node:22",
    });

    const entrypoint = await readFile(
      join(distDir, "api/server/index.mjs"),
      "utf8",
    );

    expect(entrypoint).toContain('app.http("server"');
    expect(entrypoint).toContain('from "./entry.mjs"');
    expect(entrypoint).not.toContain("@azure/functions-core");

    const bundledEntry = await readFile(
      join(distDir, "api/server/entry.mjs"),
      "utf8",
    );

    expect(bundledEntry).toContain("handleAzureSwaRequest");
    expect(bundledEntry).not.toContain("@azure/functions-core");

    await startPreview();

    await expectText("/admin/", 200, "Decap CMS");
    await expectText("/admin/config.yml", 200, "name: github");
    await expectText("/", 200, "Azure SWA Astro Adapter Demo");
    await expectText("/", 200, "React client island");
    await expectText("/", 200, "Server island fallback");
    await expectText("/", 200, "/_server-islands/");
    await expectText("/server", 200, "SSR route");
    await expectText("/hybrid", 200, "Hybrid prerendered route");
    await expectHeader("/middleware", "x-astro-azure-demo", "middleware");
    await expectText("/env", 200, "build-check");
    await expectJson("/api/health", 200, {
      ok: true,
      adapter: "@opsydyn/astro-azure-swa",
    });
    await expectJson(
      "/api/echo",
      200,
      {
        method: "POST",
        body: "hello",
        demoHeader: "yes",
      },
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: `http://127.0.0.1:${previewPort}`,
          "x-demo": "yes",
        },
        body: "hello",
      },
    );
    await expectJson("/api/elysia", 200, {
      ok: true,
      runtime: "azure-functions-v4",
      adapter: "@opsydyn/astro-azure-swa",
    });
    await expectJson("/api/elysia/greet/swa", 200, {
      greeting: "Hello, swa!",
    });
    await expectJson(
      "/api/elysia/echo",
      200,
      { message: "hello from elysia" },
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello from elysia" }),
      },
    );
    await expectText("/form", 200, "Astro Actions form demo");
    await expectText("/form", 200, "?_action=sampleForm");
    await expectActionResult(
      200,
      "Action received: form-body",
    );

    const redirect = await previewFetch("/redirect", { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/about");
    expect(redirect.headers.get("set-cookie")).toContain("redirected=yes");

    const cookies = await previewFetch("/cookies");
    expect(cookies.status).toBe(200);
    expect(cookies.headers.get("set-cookie")).toContain("demo_session=alpha");
    expect(cookies.headers.get("set-cookie")).toContain("demo_theme=dark");

    const auth = await previewFetch("/auth", { redirect: "manual" });
    expect(auth.status).toBe(302);
    expect(auth.headers.get("location")).toBe("/auth/check");
    const authCookie = auth.headers.get("set-cookie")?.split(";")[0];
    expect(authCookie).toBe("demo_auth=authenticated");

    await expectJson(
      "/auth/check",
      200,
      {
        authenticated: true,
      },
      {
        headers: {
          cookie: authCookie ?? "",
        },
      },
    );

    await expectText("/blog/getting-started", 200, "Astro on Azure Static Web Apps");
    const hybridBlog = await previewFetch("/blog/hybrid-rendering");
    expect(hybridBlog.status).toBe(200);
    const hybridBlogHtml = await hybridBlog.text();
    expect(hybridBlogHtml).toContain("Hybrid Rendering on Azure SWA");
    expect(hybridBlogHtml).toContain("pre code");
    expect(hybridBlogHtml).toContain("background:transparent");
    expect(hybridBlogHtml).toContain("padding:0");
    await expectText("/not-found", 404, "404");

    const serverIslandResponse = await fetchServerIsland("/");
    expect(serverIslandResponse.status).toBe(200);
    await expect(serverIslandResponse.text()).resolves.toContain(
      "Server island rendered",
    );

    const assetFiles = await readdir(join(distDir, "client", "_astro"));
    const counterBundleName = assetFiles.find(
      (file) => file.startsWith("ClientCounter.") && file.endsWith(".js"),
    );
    expect(counterBundleName).toBeDefined();
    const clientBundle = await readFile(
      join(distDir, "client", "_astro", counterBundleName ?? ""),
      "utf8",
    );
    expect(clientBundle).toContain("React client island");
  });
});

async function startPreview(): Promise<void> {
  previewProcess = spawn(
    bunExecutable,
    ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(previewPort)],
    {
      cwd: exampleDir,
      env: {
        ...process.env,
        ASTRO_AZURE_SAMPLE_ENV: "build-check",
      },
    },
  );

  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Preview server did not start:\n${output}`));
    }, 10_000);

    previewProcess?.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(`127.0.0.1:${previewPort}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    previewProcess?.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    previewProcess?.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview server exited with ${code}:\n${output}`));
    });
  });
}

async function stopPreview(): Promise<void> {
  if (!previewProcess || previewProcess.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    previewProcess?.once("exit", () => resolve());
    previewProcess?.kill("SIGTERM");
    setTimeout(resolve, 2_000);
  });
  previewProcess = undefined;
}

async function previewFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${previewPort}${path}`, init);
}

async function expectText(
  path: string,
  status: number,
  expected: string,
): Promise<void> {
  const response = await previewFetch(path);
  expect(response.status).toBe(status);
  await expect(response.text()).resolves.toContain(expected);
}

async function expectHeader(
  path: string,
  header: string,
  expected: string,
): Promise<void> {
  const response = await previewFetch(path);
  expect(response.status).toBe(200);
  expect(response.headers.get(header)).toBe(expected);
}

async function expectJson(
  path: string,
  status: number,
  expected: Record<string, unknown>,
  init?: RequestInit,
): Promise<void> {
  const response = await previewFetch(path, init);
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject(expected);
}

async function expectActionResult(
  status: number,
  expected: string,
): Promise<void> {
  const formPage = await previewFetch("/form");
  const html = await formPage.text();
  const action = html.match(/<form method="POST" action="([^"]+)"/)?.[1];
  expect(action).toBeDefined();
  const actionUrl = new URL(
    action ?? "/form",
    `http://127.0.0.1:${previewPort}/form`,
  );

  const response = await previewFetch(`${actionUrl.pathname}${actionUrl.search}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: `http://127.0.0.1:${previewPort}`,
    },
    body: new URLSearchParams({
      payload: "form-body",
    }),
  });

  expect(response.status).toBe(status);
  await expect(response.text()).resolves.toContain(expected);
}

async function fetchServerIsland(pagePath: string): Promise<Response> {
  const page = await previewFetch(pagePath);
  const html = await page.text();
  const path = html.match(/"\/_server-islands\/([^"]+)"/)?.[0]?.slice(1, -1);
  expect(path).toBeDefined();

  return previewFetch(path ?? "/_server-islands/missing", {
    headers: {
      referer: `http://127.0.0.1:${previewPort}${pagePath}`,
    },
  });
}
