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

function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const { apiKey, host } = parseConfig(url, req);
  console.log(`${req.method} ${url.pathname} has-key=${apiKey ? "yes" : "no"}`);

  try {
    if (url.pathname === "/.well-known/mcp/server-card.json" && req.method === "GET") {
      sendJson(res, 200, { serverInfo: { name: "stelar-signals-mcp", version: "1.0.0" } });
      return;
    }

    if (url.pathname !== "/mcp") {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    const mcpServer = buildServer({ apiKey, host });
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
