# Stelar Signals MCP

An MCP (Model Context Protocol) server that gives any MCP-compatible AI agent
(Claude Desktop, Claude Code, Cursor, etc.) six crypto market-signal and
utility tools, backed by the same classifier that runs a live production
grid-trading system, plus Claude-powered text tools.

This package ships with **no secrets of ours**. Each user brings their own
free or paid RapidAPI key — see "Get a key" below.

## Tools

| Tool | What it does |
|---|---|
| `crypto_regime` | Market regime (chop / trend_up / trend_down / high_vol) + grid-suitability verdict for SOL, XLM, BTC, ETH, XRP, DOGE, LTC, ADA |
| `crypto_sentiment` | Sentiment score (-1..+1) + label for free text or a crypto asset's recent price action |
| `summarize` | 3-5 sentence LLM summary of a URL or raw text |
| `factcheck` | true/false/uncertain verdict + confidence + reasoning for a claim |
| `pricecheck` | Price, 24h/7d change, bullish/bearish/neutral signal for a major crypto asset |
| `token_risk` | Volatility/drawdown risk regime (low/med/high) vs 30-day baseline, for position sizing |

## Paid tools (x402)

Six additional tools are pay-per-call via the [x402 protocol](https://x402.org)
(USDC on Base) at `api.stelardigital.com` — no RapidAPI signup and **no API
key required**. Any x402-capable HTTP client (e.g. `x402-fetch`, Coinbase
AgentKit) can pay and call directly; an unpaid call returns the live x402
payment envelope with the exact terms needed to complete payment and retry.

| Tool | Price/call | What it does |
|---|---|---|
| `telemetry` | $0.005 | Live, exchange-ledger-reconciled P&L of a real production grid-trading system (total + per-bot breakdown) |
| `sentiment` | $0.005 | Sentiment score (-1..+1) + label, for text or an asset |
| `price` | $0.005 | Current price, 24h/7d change, and a bullish/bearish/neutral signal for a major crypto asset |
| `risk` | $0.02 | Volatility/drawdown risk regime (low/med/high) vs 30-day baseline |
| `regime` | $0.03 | Market regime (chop/trend_up/trend_down/high_vol) + grid-suitability verdict |
| `gridparams` | $0.05 | Recommended grid-trading parameters (range, spacing, order size) for a pair + capital amount |

These are direct x402 tools, separate from the six free-with-RapidAPI-key
tools above, and are billed per call in USDC on Base rather than through a
RapidAPI subscription.

## Get a key

Free tier (50 requests/mo) and paid tiers (Pro $9.90, Ultra $24.90, Mega $49.90)
at:

https://rapidapi.com/StelarDigital/api/stelar-crypto-signals-ai-toolkit?src=mcp

Sign up, subscribe to a plan, and copy your `X-RapidAPI-Key` from the
RapidAPI dashboard's code snippet for this API — that snippet also shows the
exact gateway host to use if it differs from the default below.

## Install

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stelar-signals": {
      "command": "npx",
      "args": ["-y", "github:StelarDigital/stelar-signals-mcp"],
      "env": {
        "RAPIDAPI_KEY": "YOUR_RAPIDAPI_KEY"
      }
    }
  }
}
```

### Claude Code

```
claude mcp add stelar-signals -e RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY -- npx -y github:StelarDigital/stelar-signals-mcp
```

### Run directly

```
git clone https://github.com/stelardigital/stelar-signals-mcp
cd stelar-signals-mcp
npm install
RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY node server.js
```

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `RAPIDAPI_KEY` | yes | — | Your RapidAPI subscriber key |
| `RAPIDAPI_HOST` | no | `stelar-crypto-signals-ai-toolkit.p.rapidapi.com` | Override only if your RapidAPI dashboard shows a different gateway host for this listing |
| `BASE_URL` | no | `https://${RAPIDAPI_HOST}` | Advanced: point at a different base URL entirely (e.g. for local testing against a self-hosted mirror) |

`RAPIDAPI_KEY` is only needed for the six free-with-key tools above; the six
paid x402 tools require no env vars or config at all.

## Pricing (RapidAPI subscription, not this package)

| Tier | Price | Requests/mo |
|---|---|---|
| Basic | Free | 50 |
| Pro | $9.90/mo | 2,000 |
| Ultra | $24.90/mo | 10,000 |
| Mega | $49.90/mo | 50,000 |

This npm package itself is free and MIT-licensed. You pay RapidAPI directly
for API usage above the free tier; Stelar Digital never sees or stores your
key. The six paid x402 tools are billed separately, per call, in USDC on Base.

## Honest capability notes

- `crypto_regime`, `pricecheck`, and `token_risk` cover 8 major pairs only
  (SOL, XLM, BTC, ETH, XRP, DOGE, LTC, ADA) — not arbitrary tokens.
- `crypto_sentiment`, `summarize`, and `factcheck` are LLM-backed (Claude
  Haiku) — treat outputs as a fast first-pass signal, not ground truth.
  `factcheck` returns `uncertain` for opinions, unverifiable claims, or
  anything requiring live data the model doesn't have.
- `summarize` with a `url` fetches the page server-side; very large or
  JS-rendered pages may summarize poorly or fail — pass `text` directly for
  best results.
- All tools are rate-limited by your RapidAPI plan; the free tier (50/mo) is
  for evaluation, not production load.
- Data source is the same market-data/classifier pipeline that runs a live
  grid-trading bot — it is a decision-support signal, not investment advice.
- The paid x402 tools (`telemetry`, `sentiment`, `price`, `risk`, `regime`,
  `gridparams`) hit the same underlying data/classifier pipeline but are
  billed per call rather than by RapidAPI subscription, and require no key.

## License

MIT — see `LICENSE`.
