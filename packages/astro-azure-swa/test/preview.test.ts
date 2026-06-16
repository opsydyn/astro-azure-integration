import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import createPreviewServer from "../src/preview.js";

let root: string;
let clientPath: string;
let serverPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "astro-azure-swa-preview-"));
  clientPath = join(root, "client");
  serverPath = join(root, "server");
  await mkdir(join(clientPath, "_astro"), { recursive: true });
  await mkdir(serverPath, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function previewParams() {
  return {
    outDir: pathToFileURL(`${root}/`),
    client: pathToFileURL(`${clientPath}/`),
    server: pathToFileURL(`${serverPath}/`),
    serverEntrypoint: pathToFileURL(`${join(serverPath, "entry.mjs")}`),
    host: "127.0.0.1",
    port: 0,
    base: "/",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      options: {},
      label: "test",
      fork() {
        return this;
      },
    },
    root: pathToFileURL(`${root}/`),
  };
}

async function writeServerEntrypoint(source: string): Promise<void> {
  await writeFile(join(serverPath, "entry.mjs"), source, "utf8");
}

describe("createPreviewServer", () => {
  it("serves static files from Astro's built client directory", async () => {
    await writeFile(
      join(clientPath, "_astro", "page.css"),
      "body { color: red; }\n",
      "utf8",
    );
    await writeServerEntrypoint(`
export async function handleAzureSwaRequest() {
  return { status: 500, body: "should not run" };
}
`);

    const server = await createPreviewServer(previewParams() as never);
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/_astro/page.css`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/css");
      await expect(response.text()).resolves.toBe("body { color: red; }\n");
    } finally {
      await server.stop();
    }
  });

  it("forwards SSR requests to the built Azure SWA handler without Azure Functions", async () => {
    await writeServerEntrypoint(`
export async function handleAzureSwaRequest(request) {
  return {
    status: 201,
    headers: {
      "content-type": "application/json",
      "x-preview-method": request.method,
      "x-preview-url": request.url
    },
    cookies: [
      {
        name: "preview",
        value: "ok",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 60
      }
    ],
    body: JSON.stringify({
      method: request.method,
      url: request.url,
      body: await request.text()
    })
  };
}
`);

    const server = await createPreviewServer(previewParams() as never);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/form?x=1`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      });
      const payload = await response.json();

      expect(response.status).toBe(201);
      expect(response.headers.get("x-preview-method")).toBe("POST");
      expect(response.headers.get("x-preview-url")).toBe(
        `http://127.0.0.1:${server.port}/form?x=1`,
      );
      expect(response.headers.get("set-cookie")).toContain("preview=ok");
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(payload).toEqual({
        method: "POST",
        url: `http://127.0.0.1:${server.port}/form?x=1`,
        body: "hello",
      });
    } finally {
      await server.stop();
    }
  });
});

