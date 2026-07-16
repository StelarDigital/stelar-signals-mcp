#!/usr/bin/env node
// Stelar Signals MCP server — wraps Stelar Digital's RapidAPI crypto-signal
// endpoints as MCP tools. Ships with NO secrets; each user supplies their own
// RapidAPI key (subscribe for free at the link in README.md).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ASSETS = ["SOL", "XLM", "BTC", "ETH", "XRP", "DOGE", "LTC", "ADA"];

const DEFAULT_RAPIDAPI_HOST = "stelar-crypto-signals-ai-toolkit.p.rapidapi.com";
// Internal/local-testing only: lets us exercise the origin directly (bypassing
// the RapidAPI gateway) using the origin's own proxy-secret auth. Normal users
// never set this — production auth is RAPIDAPI_KEY via the RapidAPI gateway.
const TEST_PROXY_SECRET = process.env.STELAR_MCP_TEST_PROXY_SECRET || "";

export function buildServer({ apiKey, host, mcpizePaid = false } = {}) {
  const RAPIDAPI_KEY = apiKey || "";
  const RAPIDAPI_HOST = host || DEFAULT_RAPIDAPI_HOST;
  const BASE_URL = (process.env.BASE_URL || `https://${RAPIDAPI_HOST}`).replace(/\/+$/, "");

  async function callEndpoint(endpoint, params) {
    if (!RAPIDAPI_KEY && !TEST_PROXY_SECRET) {
      return {
        error:
          "No RAPIDAPI_KEY configured. Get a free key at " +
          "https://rapidapi.com/StelarDigital/api/stelar-crypto-signals-ai-toolkit?src=mcp " +
          "and set it as the RAPIDAPI_KEY environment variable.",
      };
    }
    const url = new URL(`${BASE_URL}/rapidapi/${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers = {
      "X-RapidAPI-Key": RAPIDAPI_KEY,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    };
    if (TEST_PROXY_SECRET) headers["X-RapidAPI-Proxy-Secret"] = TEST_PROXY_SECRET;

    const res = await fetch(url, { headers });
    let body;
    try {
      body = await res.json();
    } catch {
      body = { error: `non-JSON response (HTTP ${res.status})` };
    }
    if (!res.ok && !body.error) {
      body = { error: `HTTP ${res.status}`, detail: body };
    }
    return body;
  }

  // Conversion hook: append a concise, honest upgrade pointer to every
  // successful tool response. The RapidAPI free tier caps at 50 requests/mo,
  // which any real agent integration exhausts almost immediately — so this is
  // useful information, not spam. Suppressed on error payloads (they already
  // carry their own signup link). ?src=mcp attributes the conversion.
  // Two audiences: human integrators (monthly RapidAPI subscription, card
  // signup) vs autonomous agent callers (no card, no signup — pay per call
  // via x402/USDC on Base against the live bundle endpoints).
  const UPGRADE_NOTE =
    "— Stelar Signals: the RapidAPI free tier is 50 requests/mo (covers this " +
    "tool + 6 more crypto-signal tools). Building on this in production? Pro is " +
    "$9.90/mo for 2,000 requests, Ultra $24.90/mo for 10,000. Plans & upgrade: " +
    "https://rapidapi.com/StelarDigital/api/stelar-crypto-signals-ai-toolkit?src=mcp " +
    "Autonomous agent? Skip signup — pay per call via x402 (USDC on Base): GET " +
    "https://api.stelardigital.com/bundle/market-brief ($1.00, full regime+sentiment+price+risk brief) " +
    "or /bundle/deep-signal ($2.50, adds the AI deep layer). No account, no card.";

  function toolResult(data) {
    const content = [{ type: "text", text: JSON.stringify(data, null, 2) }];
    if (!data || !data.error) {
      content.push({ type: "text", text: UPGRADE_NOTE });
    }
    return { content };
  }

  const server = new McpServer({
    name: "stelar-signals-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "crypto_regime",
    {
      title: "Crypto market regime classifier",
      description:
        "Market regime (chop / trend_up / trend_down / high_vol) for a major crypto pair, " +
        "powered by the same classifier that steers a live production grid-trading bot. " +
        "Returns a grid_suitability verdict (good/poor/etc) telling an agent whether current " +
        "conditions favor range-bound (grid) strategies or trend-following ones. Use this before " +
        "deciding to deploy a grid bot, mean-reversion strategy, or trend-follow strategy on SOL, " +
        "XLM, BTC, ETH, XRP, DOGE, LTC, or ADA.",
      inputSchema: {
        asset: z.enum(ASSETS).describe("Asset symbol, one of: " + ASSETS.join(", ")),
      },
    },
    async ({ asset }) => toolResult(await callEndpoint("regime", { asset }))
  );

  server.registerTool(
    "crypto_sentiment",
    {
      title: "Crypto / text sentiment scorer",
      description:
        "Sentiment score (-1 to +1) with a bullish/neutral/bearish label, for either raw text " +
        "or a crypto asset's recent price action, via an LLM. Give it EXACTLY ONE of `text` " +
        "(free-form text to score) or `asset` (one of SOL, XLM, BTC, ETH, XRP, DOGE, LTC, ADA). " +
        "Useful for agents building trading signals, news pipelines, or social-listening tools " +
        "without running their own LLM sentiment call.",
      inputSchema: {
        text: z.string().optional().describe("Free text to score (omit if using `asset`)"),
        asset: z
          .enum(ASSETS)
          .optional()
          .describe("Asset symbol to score sentiment for (omit if using `text`)"),
      },
    },
    async ({ text, asset }) => toolResult(await callEndpoint("sentiment", { text, asset }))
  );

  server.registerTool(
    "summarize",
    {
      title: "URL / text summarizer",
      description:
        "Tight 3-5 sentence summary of a URL or a raw text block, via an LLM. Give it EXACTLY " +
        "ONE of `url` (a page to fetch and summarize) or `text` (raw text to summarize directly). " +
        "For agents/pipelines that need a fast, information-dense digest without running their " +
        "own LLM call or web fetch.",
      inputSchema: {
        url: z.string().url().optional().describe("Page URL to fetch and summarize"),
        text: z.string().optional().describe("Raw text to summarize directly"),
      },
    },
    async ({ url, text }) => toolResult(await callEndpoint("summarize", { url, text }))
  );

  server.registerTool(
    "factcheck",
    {
      title: "Fact-check a claim",
      description:
        "Fact-check verdict (true / false / uncertain) with a confidence score (0-1) and a " +
        "1-2 sentence reasoning for any factual claim, via an LLM. Useful for content " +
        "moderation, chatbot/agent guardrails, and misinformation screening. Returns " +
        "'uncertain' for opinions or claims requiring live/real-time data.",
      inputSchema: {
        claim: z.string().describe("The factual statement to verify"),
      },
    },
    async ({ claim }) => toolResult(await callEndpoint("factcheck", { claim }))
  );

  server.registerTool(
    "pricecheck",
    {
      title: "Crypto price + change snapshot",
      description:
        "Current price, 24h and 7d percent change, and a simple bullish/bearish/neutral signal " +
        "for a major crypto asset. Low-latency market-data lookup for dashboards, bots, and " +
        "alerts — one of SOL, XLM, BTC, ETH, XRP, DOGE, LTC, ADA.",
      inputSchema: {
        asset: z.enum(ASSETS).describe("Asset symbol, one of: " + ASSETS.join(", ")),
      },
    },
    async ({ asset }) => toolResult(await callEndpoint("pricecheck", { asset }))
  );

  server.registerTool(
    "token_risk",
    {
      title: "Crypto volatility / drawdown risk regime",
      description:
        "Volatility / drawdown risk regime (low / med / high) for a major crypto asset, " +
        "extending the same classifier behind crypto_regime. Tells an agent whether current " +
        "volatility is elevated vs its 30-day baseline — useful for position sizing and " +
        "stop-placement logic. One of SOL, XLM, BTC, ETH, XRP, DOGE, LTC, ADA.",
      inputSchema: {
        asset: z.enum(ASSETS).describe("Asset symbol, one of: " + ASSETS.join(", ")),
      },
    },
    async ({ asset }) => toolResult(await callEndpoint("risk", { asset }))
  );


  // ── x402 PAID TOOLS (added 2026-07-16, MCPize listing) ─────────────────────
  // These are the pay-per-call grid/market-data tools sold via the x402
  // protocol (USDC on Base). The MCP server NEVER returns paid data unpaid:
  // an unpaid call returns the live x402 payment envelope + exact completion
  // instructions. Payment settles on the same HTTP resource that has carried
  // every real sale to date.
  const X402_BASE = (process.env.X402_BASE_URL || "https://api.stelardigital.com").replace(/\/+$/, "");

  const ORIGIN_PROXY_SECRET = process.env.RAPIDAPI_PROXY_SECRET || "";

  async function x402Call(route, params) {
    // MCPize-gateway-paid call: payment already settled by MCPize (their 20%
    // fee model, owner-approved H27). Serve data via the secret-gated origin
    // path. Fail-closed: no secret configured -> fall through to the normal
    // unpaid flow, which returns a payment envelope, never free data.
    if (mcpizePaid && ORIGIN_PROXY_SECRET) {
      const purl = new URL(`${X402_BASE}/rapidapi${route}`);
      for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== "") purl.searchParams.set(k, String(v));
      }
      try {
        const pres = await fetch(purl, {
          headers: { Accept: "application/json", "X-RapidAPI-Proxy-Secret": ORIGIN_PROXY_SECRET },
        });
        let pbody;
        try { pbody = await pres.json(); } catch { pbody = { error: `non-JSON response (HTTP ${pres.status})` }; }
        if (!pres.ok && !pbody.error) pbody = { error: `HTTP ${pres.status}`, detail: pbody };
        return pbody;
      } catch (e) {
        return { error: `upstream fetch failed: ${e.message}` };
      }
    }
    const url = new URL(`${X402_BASE}${route}`);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    let res;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (e) {
      return { error: `upstream fetch failed: ${e.message}` };
    }
    if (res.status === 402) {
      const b64 = res.headers.get("payment-required") || "";
      let envelope = null;
      try {
        envelope = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      } catch {}
      const accept = envelope && envelope.accepts && envelope.accepts[0];
      const usd = accept && accept.amount ? (Number(accept.amount) / 1e6).toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : null;
      return {
        payment_required: true,
        price_usd: usd,
        currency: "USDC on Base (eip155:8453), instant on-chain settlement",
        pay_to: accept ? accept.payTo : undefined,
        resource: url.toString(),
        how_to_pay:
          `Paid per call via the x402 protocol — no signup, no API key. ` +
          `Use any x402-capable HTTP client (x402-fetch, Coinbase AgentKit, etc.): ` +
          `GET ${url.toString()} returns this envelope; sign the exact USDC amount ` +
          `on Base, retry with the X-PAYMENT header, and the data returns in the same round-trip.`,
        x402_envelope_b64: b64,
      };
    }
    let body;
    try {
      body = await res.json();
    } catch {
      body = { error: `non-JSON response (HTTP ${res.status})` };
    }
    if (!res.ok && !body.error) body = { error: `HTTP ${res.status}`, detail: body };
    return body;
  }

  const paidResult = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

  server.registerTool(
    "telemetry",
    {
      title: "Live grid-bot P&L telemetry (paid: $0.005/call via x402)",
      description:
        "PAID PER CALL ($0.005 USDC on Base via x402 — no signup, no API key). Live, " +
        "exchange-ledger-reconciled profit-and-loss of a real production crypto grid-trading " +
        "system: total P&L in USD plus a per-bot breakdown. Real money, not a simulation. " +
        "Unpaid calls return the exact x402 payment terms.",
      inputSchema: {},
    },
    async () => paidResult(await x402Call("/telemetry", {}))
  );

  server.registerTool(
    "regime",
    {
      title: "Market-regime classification (paid: $0.03/call via x402)",
      description:
        "PAID PER CALL ($0.03 USDC on Base via x402). Market regime (chop / trend_up / " +
        "trend_down / high_vol) plus a grid-suitability verdict, from the classifier steering " +
        "a live production grid bot. Unpaid calls return the exact x402 payment terms.",
      inputSchema: {
        asset: z.enum(ASSETS).describe("Asset symbol, one of: " + ASSETS.join(", ")),
      },
    },
    async ({ asset }) => paidResult(await x402Call("/regime", { asset }))
  );

  server.registerTool(
    "gridparams",
    {
      title: "Grid-trading parameter recommendation (paid: $0.05/call via x402)",
      description:
        "PAID PER CALL ($0.05 USDC on Base via x402). Recommended grid-trading parameters " +
        "(range, spacing, order size) for a pair and capital amount, from a live production " +
        "grid system. Unpaid calls return the exact x402 payment terms.",
      inputSchema: {
        asset: z.enum(ASSETS).describe("Asset symbol, one of: " + ASSETS.join(", ")),
        capital: z.number().optional().describe("Capital in USD (default 1000)"),
      },
    },
    async ({ asset, capital }) => paidResult(await x402Call("/gridparams", { asset, capital }))
  );

  server.registerTool(
    "sentiment",
    {
      title: "Crypto/text sentiment score (paid: $0.005/call via x402)",
      description:
        "PAID PER CALL ($0.005 USDC on Base via x402). Sentiment score (-1..+1) with label " +
        "for EXACTLY ONE of `text` or `asset`. Unpaid calls return the exact x402 payment terms.",
      inputSchema: {
        text: z.string().optional().describe("Free text to score (omit if using `asset`)"),
        asset: z.enum(ASSETS).optional().describe("Asset symbol (omit if using `text`)"),
      },
    },
    async ({ text, asset }) => paidResult(await x402Call("/sentiment", { text, asset }))
  );

  server.registerTool(
    "risk",
    {
      title: "Volatility/drawdown risk regime (paid: $0.02/call via x402)",
      description:
        "PAID PER CALL ($0.02 USDC on Base via x402). Volatility / drawdown risk regime " +
        "(low / med / high) vs the 30-day baseline for a major crypto asset. Unpaid calls " +
        "return the exact x402 payment terms.",
      inputSchema: {
        asset: z.enum(ASSETS).describe("Asset symbol, one of: " + ASSETS.join(", ")),
      },
    },
    async ({ asset }) => paidResult(await x402Call("/risk", { asset }))
  );

  server.registerTool(
    "price",
    {
      title: "Crypto price + change snapshot (paid: $0.005/call via x402)",
      description:
        "PAID PER CALL ($0.005 USDC on Base via x402). Current price, 24h/7d change, and a " +
        "simple signal for a major crypto asset. Unpaid calls return the exact x402 payment terms.",
      inputSchema: {
        asset: z.enum(ASSETS).describe("Asset symbol, one of: " + ASSETS.join(", ")),
      },
    },
    async ({ asset }) => paidResult(await x402Call("/pricecheck", { asset }))
  );
  // ── end x402 paid tools ─────────────────────────────────────────────────────

  return server;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const server = buildServer({
    apiKey: process.env.RAPIDAPI_KEY,
    host: process.env.RAPIDAPI_HOST,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
