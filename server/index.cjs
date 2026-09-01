"use strict";

/**
 * Headless server shell (used by the Docker image).
 * Serves the built React UI plus a JSON API and an SSE event stream,
 * all backed by the exact same core service the Electron app uses.
 */

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createService } = require("../core/service.cjs");

const PORT = Number(process.env["NETSCAN_PORT"] || 8099) || 8099;
const HOST = process.env["NETSCAN_HOST"] || "0.0.0.0";
const DATA_DIR = process.env["NETSCAN_DATA_DIR"] || path.join(process.cwd(), "data");
const STATIC_DIR = process.env["NETSCAN_STATIC_DIR"] || path.join(__dirname, "..", "dist-app");
// Opt-in: unset by default so plain `docker compose up`/HA-Ingress deployments
// (which already gate access some other way) keep working unauthenticated.
// Set this to require a bearer/query token on every API route except
// /api/info, which the frontend probes before it has a token to send.
const API_TOKEN = process.env["NETSCAN_API_TOKEN"] || "";

const service = createService({ dbFile: path.join(DATA_DIR, "netscan.db") });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * EventSource can't set custom headers, so the token may arrive either as
 * `Authorization: Bearer <token>` (regular fetches) or `?token=` (SSE).
 * Constant-time compare against a token-length buffer so an invalid guess
 * can't be timed to learn its correct length.
 */
function isAuthorized(req, url) {
  if (!API_TOKEN) return true;
  const header = req.headers["authorization"] || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token") || "";
  const expected = Buffer.from(API_TOKEN);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(STATIC_DIR, path.normalize(relative).replace(/^(\.\.[/\\])+/, ""));

  if (
    !filePath.startsWith(STATIC_DIR) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    const indexPath = path.join(STATIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      return fs.createReadStream(indexPath).pipe(res);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("UI bundle not found. Run the frontend build first.");
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=86400",
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api/, "") || "/";
  const method = req.method || "GET";
  const q = url.searchParams;

  if (method === "GET") {
    switch (route) {
      case "/info":
        return sendJson(res, 200, service.getInfo());
      case "/networks":
        return sendJson(res, 200, service.listNetworks());
      case "/devices":
        return sendJson(res, 200, service.listDevices(q.get("networkId") || undefined));
      case "/device":
        return sendJson(res, 200, service.getDevice(q.get("id")));
      case "/scans":
        return sendJson(res, 200, service.listScans(q.get("networkId") || undefined));
      case "/scan":
        return sendJson(res, 200, service.getScanDetail(q.get("id")));
      case "/scan/status":
        return sendJson(res, 200, service.getScanStatus());
      case "/dashboard":
        return sendJson(res, 200, service.getDashboard());
      case "/history":
        return sendJson(res, 200, service.listHistory(q.get("deviceId") || undefined));
      case "/detect":
        return sendJson(res, 200, service.detectNetworks());
      case "/preview":
        return sendJson(res, 200, service.previewTargets(q.get("target") || ""));
      case "/export":
        return sendJson(res, 200, service.exportAll());
      case "/vault/status":
        return sendJson(res, 200, service.getVaultStatus());
      case "/credentials":
        return sendJson(res, 200, service.listCredentials(q.get("deviceId") || undefined));
      case "/credentials/secret":
        return sendJson(res, 200, service.getCredentialSecret(q.get("id")));
      default:
        return sendJson(res, 404, { error: `Unknown endpoint ${route}` });
    }
  }

  const body = await readBody(req);

  switch (`${method} ${route}`) {
    case "POST /networks":
      return sendJson(res, 201, service.createNetwork(body));
    case "PATCH /networks":
      return sendJson(res, 200, service.updateNetwork(body.id, body.patch || {}));
    case "DELETE /networks":
      return sendJson(res, 200, service.deleteNetwork(body.id));
    case "PATCH /devices":
      return sendJson(res, 200, service.updateDevice(body.id, body.patch || {}));
    case "POST /scan/start":
      return sendJson(res, 202, await service.startScan(body.networkId, body.options || {}));
    case "POST /scan/stop":
      return sendJson(res, 200, service.stopScan());
    case "POST /ping/start":
      return sendJson(res, 202, service.startPing(body.ip, body.options || {}));
    case "POST /ping/stop":
      return sendJson(res, 200, service.stopPing(body.sessionId));
    case "POST /vault/setup":
      return sendJson(res, 201, service.setupVault(body.password));
    case "POST /vault/unlock":
      return sendJson(res, 200, service.unlockVault(body.password));
    case "POST /vault/lock":
      return sendJson(res, 200, service.lockVault());
    case "POST /vault/change-password":
      return sendJson(res, 200, service.changeMasterPassword(body.oldPassword, body.newPassword));
    case "POST /vault/reset":
      return sendJson(res, 200, service.resetVault());
    case "POST /credentials":
      return sendJson(res, 201, service.createCredential(body));
    case "PATCH /credentials":
      return sendJson(res, 200, service.updateCredential(body.id, body.patch || {}));
    case "DELETE /credentials":
      return sendJson(res, 200, service.deleteCredential(body.id));
    default:
      return sendJson(res, 404, { error: `Unknown endpoint ${method} ${route}` });
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const unsubscribe = service.onEvent((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 20000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    const guarded = url.pathname.startsWith("/api/") && url.pathname !== "/api/info";
    if (guarded && !isAuthorized(req, url)) {
      return sendJson(res, 401, { error: "Unauthorized - missing or invalid API token" });
    }

    if (url.pathname === "/api/events") return handleEvents(req, res);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return sendJson(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[netscan] listening on http://${HOST}:${PORT}`);
  console.log(`[netscan] storage backend: ${service.db.backend} (${service.db.file})`);
  console.log(
    API_TOKEN
      ? "[netscan] API token required - open the UI once with ?token=<value> to authorize this browser"
      : "[netscan] no API token set (NETSCAN_API_TOKEN) - API is open to anyone reaching this host/port",
  );
});

/* Optional scheduled scanning, controlled by env vars. */
const intervalMinutes = Number(process.env["NETSCAN_INTERVAL_MINUTES"] || 0);
const defaultSubnet = process.env["NETSCAN_DEFAULT_SUBNET"] || "";

if (defaultSubnet && !service.listNetworks().length) {
  try {
    service.createNetwork({ name: "Default", cidr: defaultSubnet, source: "env" });
    console.log(`[netscan] seeded default network ${defaultSubnet}`);
  } catch (error) {
    console.warn(`[netscan] could not seed default network: ${error.message}`);
  }
}

if (intervalMinutes > 0) {
  console.log(`[netscan] scheduled scans every ${intervalMinutes} minute(s)`);
  setInterval(
    () => {
      const networks = service.listNetworks();
      if (!networks.length) return;
      if (service.getScanStatus().running) return;
      service.startScan(networks[0].id).catch((error) => {
        console.warn(`[netscan] scheduled scan failed: ${error.message}`);
      });
    },
    intervalMinutes * 60 * 1000,
  );
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log("[netscan] shutting down");
    service.close();
    server.close(() => process.exit(0));
  });
}
