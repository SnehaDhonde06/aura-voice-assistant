import "dotenv/config";
import { getLlmCandidates } from "../services/llmConfig.js";
import { listModels, pickModel } from "../services/modelDiscovery.js";

const seen = new Set<string>();
for (const cfg of getLlmCandidates()) {
  if (seen.has(cfg.provider)) continue;
  seen.add(cfg.provider);
  const ids = await listModels(cfg);
  console.log(`\n=== ${cfg.provider} (${ids.length} models) ===`);
  console.log(ids.length ? ids.join("\n") : "Could not list models. Check the key.");
  console.log(`Suggested: ${pickModel(cfg.provider, ids) ?? "none found"}`);
}
if (seen.size === 0) console.log("No API keys configured in server/.env.");