#!/usr/bin/env node
// Stelar Signals MCP server — wraps Stelar Digital's RapidAPI crypto-signal
// endpoints as MCP tools. Ships with NO secrets; each user supplies their own
// RapidAPI key (subscribe for free at the link in README.md).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ASSETS = ["SOL", "XLM", "BTC", "ETH", "XRP", "DOGE", "LTC", "ADA"];

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST =
  process.env.RAPIDAPI_HOST || "stelar-crypto-signals-ai-toolkit.p.rapidapi.com";
const BASE_URL = (process.env.BASE_URL || `https://${RAPIDAPI_HOST}`).replace(/\/+$/, "");
// Internal/local-testing only: lets us exercise the origin directly (bypassing
// the RapidAPI gateway) using the origin's own proxy-secret auth. Normal users
// never set this — production auth is RAPIDAPI_KEY via the RapidAPI gateway.
const TEST_PROXY_SECRET = process.env.STELAR_MCP_TEST_PROXY_SECRET || "";

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

function toolResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
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

const transport = new StdioServerTransport();
await server.connect(transport);
