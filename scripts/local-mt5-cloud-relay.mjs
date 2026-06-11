import { createServer } from "node:http";

const port = Number(process.env.STAR_GOLD_LOCAL_RELAY_PORT ?? 3000);
const cloudIngestUrl = process.env.STAR_GOLD_CLOUD_INGEST_URL ?? "https://stargold-chi.vercel.app/api/market/mt5/ingest";
const bridgeToken = process.env.MT5_BRIDGE_TOKEN ?? "";
const maxBodyBytes = 8 * 1024 * 1024;

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

    if (request.method === "OPTIONS") {
      send(response, 204, "");
      return;
    }

    if (requestUrl.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        relay: "Star Gold By TSR local MT5 cloud relay",
        cloudIngestUrl,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (requestUrl.pathname !== "/api/market/mt5/ingest") {
      sendJson(response, 404, { ok: false, error: "Unknown local relay path." });
      return;
    }

    const targetUrl = new URL(cloudIngestUrl);
    requestUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));

    if (bridgeToken && !targetUrl.searchParams.has("token")) {
      targetUrl.searchParams.set("token", bridgeToken);
    }

    const body = request.method === "POST" ? await readRequestBody(request) : undefined;
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "content-type": request.headers["content-type"] ?? "application/json",
        ...(bridgeToken ? { "x-mt5-token": bridgeToken } : {}),
      },
      body,
      cache: "no-store",
    });

    const text = await upstream.text();
    send(response, upstream.status, text, upstream.headers.get("content-type") ?? "application/json");

    if (upstream.ok) {
      console.log(`[${new Date().toISOString()}] forwarded ${request.method} ${requestUrl.pathname} -> ${upstream.status}`);
    } else {
      console.error(`[${new Date().toISOString()}] cloud relay rejected ${request.method}: ${upstream.status} ${text}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${new Date().toISOString()}] local relay error: ${message}`);
    sendJson(response, 502, { ok: false, error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Star Gold By TSR local MT5 cloud relay listening on http://127.0.0.1:${port}`);
  console.log(`Forwarding MT5 traffic to ${cloudIngestUrl}`);
});

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > maxBodyBytes) {
        reject(new Error("MT5 payload is too large."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload), "application/json");
}

function send(response, status, body, contentType = "text/plain") {
  response.writeHead(status, {
    "access-control-allow-headers": "content-type,x-mt5-token",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": contentType,
  });
  response.end(body);
}
