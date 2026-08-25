# Stelar Signals MCP

An MCP (Model Context Protocol) server that gives any MCP-compatible agent
(Claude Code, Claude Desktop, Cursor, Windsurf, Codex …) live crypto market
signals and portfolio telemetry.

**Six of its tools are pay-per-call over [x402](https://x402.org) — no signup,
no account, and no API key.** Your agent pays cents in USDC on Base from its own
wallet and gets the data back in the same request.

## Install

```bash
claude mcp add stelar -- npx -y stelar-signals-mcp
```

Or in any MCP client config:

```json
{
  "mcpServers": {
    "stelar": { "command": "npx", "args": ["-y", "stelar-signals-mcp"] }
  }
}
```

The server starts and lists every tool with no environment variables set.

## Paid tools — x402, USDC on Base, no key required

| Tool | Price | What you get |
|---|---|---|
| `price` | $0.005 | Current price, 24h and 7d change, bull/bear/neutral signal |
| `sentiment` | $0.005 | Sentiment score (-1 to +1) and label, for text or an asset |
| `telemetry` | $0.005 | Live telemetry of an AI-managed crypto portfolio — allocation, reconciled P&L, signal votes, human-approval trail |
| `risk` | $0.02 | Volatility / drawdown risk regime — ATR% vs its 30-day p80 baseline, labeled low/med/high |
| `regime` | $0.03 | Market regime (chop / uptrend / downtrend / high-volatility) plus a grid-trading suitability verdict |
| `gridparams` | $0.05 | Grid count, spacing %, price band and per-grid allocation from live 24h market structure |

These call `https://api.stelardigital.com`, which answers HTTP 402 with a payment
challenge. Any x402-capable client settles it and retries automatically. Assets
covered: SOL, BTC, ETH, XRP, DOGE, LTC, ADA, XLM.

These are live production endpoints backed by real market data — not demo stubs.

## Free-tier tools — these DO need a RapidAPI key

`crypto_regime`, `crypto_sentiment`, `pricecheck`, `token_risk`, `summarize`,
`factcheck` are served through RapidAPI. Set `RAPIDAPI_KEY` to use them:

```bash
claude mcp add stelar -e RAPIDAPI_KEY=your-key -- npx -y stelar-signals-mcp
```

Without the key these six return a clear error; **the six paid x402 tools above
keep working**, because they do not use RapidAPI at all.

## Discovery

```
GET https://api.stelardigital.com/catalog          endpoints, prices, parameters
GET https://api.stelardigital.com/.well-known/x402 x402 discovery manifest
GET https://api.stelardigital.com/openapi.json     OpenAPI 3.1 spec
```

A hosted streamable-HTTP MCP endpoint is also live at
`https://api.stelardigital.com/mcp`.

## Honest limits

- Signals cover the eight majors listed above, not arbitrary tokens.
- Paid tools need a funded wallet; without one they return HTTP 402 rather than data.
- Every response carries `generated_at`; nothing is cached longer than a minute.

## About

Built by [Stelar Digital](https://stelardigital.com). One human. One AI. A whole company.

MIT licensed.
