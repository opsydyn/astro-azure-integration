import { describe, expect, it } from "vitest";

import { toAzureResponse, toWebRequest } from "../src/bridge.js";

interface FakeHttpRequest {
  url: string;
  method: string;
  headers: Headers;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function makeRequest(init: {
  url?: string;
  method?: string;
  headers?: HeadersInit;
  body?: string | Uint8Array;
}): FakeHttpRequest {
  const body =
    typeof init.body === "string"
      ? new TextEncoder().encode(init.body)
      : (init.body ?? new Uint8Array());

  return {
    url: init.url ?? "https://example.test/form?x=1",
    method: init.method ?? "GET",
    headers: new Headers(init.headers),
    arrayBuffer: async () => {
      const copy = new Uint8Array(body.byteLength);
      copy.set(body);
      return copy.buffer;
    },
  };
}

describe("toWebRequest", () => {
  it("preserves URL, method, headers, and body", async () => {
    const request = await toWebRequest(
      makeRequest({
        method: "POST",
        headers: { "content-type": "text/plain", "x-test": "ok" },
        body: "hello",
      }) as never,
    );

    expect(request.url).toBe("https://example.test/form?x=1");
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("text/plain");
    expect(request.headers.get("x-test")).toBe("ok");
    await expect(request.text()).resolves.toBe("hello");
  });

  it("does not read bodies for GET requests", async () => {
    let read = false;
    const request = makeRequest({ method: "GET", body: "ignored" });
    request.arrayBuffer = async () => {
      read = true;
      return new ArrayBuffer(0);
    };

    const webRequest = await toWebRequest(request as never);

    expect(webRequest.method).toBe("GET");
    expect(read).toBe(false);
  });
});

describe("toAzureResponse", () => {
  it("preserves status, headers, and text body", async () => {
    const response = await toAzureResponse(
      new Response("created", {
        status: 201,
        headers: {
          location: "/created",
          "content-type": "text/plain",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers).toMatchObject({
      location: "/created",
      "content-type": "text/plain",
    });
    expect(new TextDecoder().decode(response.body as ArrayBuffer)).toBe(
      "created",
    );
  });

  it("preserves binary bodies", async () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const response = await toAzureResponse(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    expect([...new Uint8Array(response.body as ArrayBuffer)]).toEqual([
      0, 1, 2, 255,
    ]);
  });
});
