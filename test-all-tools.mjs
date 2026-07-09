import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const secret = process.env.RAPIDAPI_PROXY_SECRET || "";
if (!secret) {
  console.error("RAPIDAPI_PROXY_SECRET not set in environment");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
  env: {
    PATH: process.env.PATH,
    BASE_URL: "http://127.0.0.1:3003",
    RAPIDAPI_KEY: "test-key-not-checked-by-origin",
    RAPIDAPI_HOST: "test-host-not-checked-by-origin",
    STELAR_MCP_TEST_PROXY_SECRET: secret,
  },
});

const client = new Client({ name: "stelar-mcp-test-client", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("=== tools/list ===");
console.log(tools.tools.map((t) => t.name).join(", "));

const calls = [
  ["crypto_regime", { asset: "SOL" }],
  ["crypto_sentiment", { asset: "BTC" }],
  ["summarize", { text: "Bitcoin is a decentralized digital currency created in 2009 by Satoshi Nakamoto. It operates on a peer-to-peer network without a central authority, using blockchain technology to record transactions." }],
  ["factcheck", { claim: "The Great Wall of China is visible from space with the naked eye" }],
  ["pricecheck", { asset: "ETH" }],
  ["token_risk", { asset: "XRP" }],
];

let allOk = true;
for (const [name, args] of calls) {
  console.log(`\n=== ${name}(${JSON.stringify(args)}) ===`);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.log("NOT VALID JSON:", text);
      allOk = false;
      continue;
    }
    console.log(JSON.stringify(parsed, null, 2));
    if (parsed.error) {
      console.log(`>>> ${name} returned an error field`);
      allOk = false;
    }
  } catch (e) {
    console.log("TOOL CALL THREW:", e.message);
    allOk = false;
  }
}

await client.close();
console.log(allOk ? "\nALL TOOLS RETURNED VALID JSON WITHOUT ERROR" : "\nSOME TOOLS FAILED");
process.exit(allOk ? 0 : 1);
