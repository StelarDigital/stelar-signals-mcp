#!/usr/bin/env node
// Streamable-HTTP entry point for the Stelar Signals MCP server (Smithery hosting).
// Stateless: no server-side session state, no secrets baked in — each request
// carries its own RapidAPI credentials via query params or headers.

import http from "node:http";
import { URL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";

const HOST = "127.0.0.1";
const PORT = 3007;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseConfig(url, req) {
  let apiKey = url.searchParams.get("rapidApiKey") || req.headers["x-rapidapi-key"] || "";
  let host = url.searchParams.get("rapidApiHost") || req.headers["x-rapidapi-host"] || "";

  const configParam = url.searchParams.get("config");
  if (configParam) {
    try {
      const decoded = Buffer.from(configParam, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (!apiKey && parsed.rapidApiKey) apiKey = parsed.rapidApiKey;
      if (!host && parsed.rapidApiHost) host = parsed.rapidApiHost;
    } catch {
      // ignore malformed config param
    }
  }

  return { apiKey, host: host || undefined };
}

// MCPize gateway detection: their proxy adds X-MCPize-Proxy-Secret to every
// forwarded request AFTER collecting x402 payment from the agent. A verified
// secret means the call is already paid — serve data via the secret-gated
// origin path instead of returning our own payment envelope.
const MCPIZE_PROXY_SECRET = process.env.MCPIZE_PROXY_SECRET || "";
function isMcpizePaid(req) {
  if (!MCPIZE_PROXY_SECRET) return false;
  const supplied = req.headers["x-mcpize-proxy-secret"] || "";
  if (!supplied || supplied.length !== MCPIZE_PROXY_SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i++) diff |= supplied.charCodeAt(i) ^ MCPIZE_PROXY_SECRET.charCodeAt(i);
  return diff === 0;
}

function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const { apiKey, host } = parseConfig(url, req);
  const mcpizePaid = isMcpizePaid(req);
  console.log(`${req.method} ${url.pathname} has-key=${apiKey ? "yes" : "no"} mcpize-paid=${mcpizePaid ? "yes" : "no"}`);

  try {
    if (url.pathname === "/.well-known/mcp/server-card.json" && req.method === "GET") {
      sendJson(res, 200, { serverInfo: { name: "stelar-signals-mcp", version: "1.0.0" } });
      return;
    }

    if (url.pathname !== "/mcp") {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    const mcpServer = buildServer({ apiKey, host, mcpizePaid });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);

    let parsedBody;
    if (req.method === "POST") {
      const raw = await readBody(req);
      if (raw.length) {
        try {
          parsedBody = JSON.parse(raw.toString("utf8"));
        } catch {
          sendJson(res, 400, {
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          });
          return;
        }
      }
    }

    // Receipt instrument (2026-07-12): log the JSON-RPC method so the daily
    // counter can separate real tool invocations (tools/call) from discovery-
    // crawler handshakes (initialize/tools/list). Without this, "N calls/day"
    // conflates registry probes with actual agent demand — the 07-24 MCP judge
    // needs the real tool-call count, not the handshake-inflated total.
    const mcpMethod = Array.isArray(parsedBody)
      ? "batch"
      : parsedBody && typeof parsedBody === "object"
        ? parsedBody.method
        : undefined;
    if (mcpMethod) {
      console.log(`MCP method=${mcpMethod} has-key=${apiKey ? "yes" : "no"}`);
    }

    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    await transport.handleRequest(req, res, parsedBody);
  } catch (err) {
    console.error("mcp request error:", err.message);
    sendJson(res, 500, {
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Stelar Signals MCP (Streamable HTTP) listening on ${HOST}:${PORT}/mcp`);
});
