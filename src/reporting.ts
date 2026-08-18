import fs from "node:fs";
import { formatCost, formatNumber } from "./text";
import type { LlmMeter } from "./meter";

export function renderUsageTable(meter: LlmMeter): string {
  const providerRollup = meter.breakdown;
  const providers = Object.keys(providerRollup);
  const cacheRollup = meter.savings;

  if (providers.length === 0) return "No usage data to report.";

  const providerWidth = Math.max(
    "Provider".length,
    providers.reduce((m, p) => Math.max(m, p.length), 0)
  );

  const lines: string[] = [];
  const innerWidth = providerWidth + 32;
  const title = "llm-meter Usage Report";
  lines.push("┌" + "─".repeat(innerWidth) + "┐");
  lines.push("│" + ` ${title}`.padEnd(innerWidth) + "│");
  lines.push("├" + "─".repeat(innerWidth) + "┤");
  lines.push(`│ ${"Provider".padEnd(providerWidth)} │ Calls │ Tokens │ Cost   │`);
  lines.push("├" + "─".repeat(innerWidth) + "┤");

  for (const provider of providers.sort()) {
    const usage = providerRollup[provider]!;
    const tokensStr = formatNumber(usage.tokens);
    const costStr = formatCost(usage.costUsd);
    lines.push(
      `│ ${provider.padEnd(providerWidth)} │ ${String(usage.calls).padStart(5)} │ ${tokensStr.padStart(
        6
      )} │ ${costStr.padStart(6)} │`
    );
  }

  const total = meter.summary;
  lines.push("├" + "─".repeat(innerWidth) + "┤");
  lines.push(
    `│ ${"Total".padEnd(providerWidth)} │ ${String(total.calls).padStart(5)} │ ${formatNumber(
      total.tokens
    ).padStart(6)} │ ${formatCost(total.costUsd).padStart(6)} │`
  );

  if (cacheRollup.hitCount > 0) {
    lines.push(
      `│ ${"Cache Saved".padEnd(providerWidth)} │ ${"".padStart(5)} │ ${formatNumber(
        cacheRollup.tokensSaved
      ).padStart(6)} │ ${formatCost(cacheRollup.usdSaved).padStart(6)} │`
    );
  }

  lines.push("└" + "─".repeat(innerWidth) + "┘");
  return lines.join("\n");
}

export function saveUsageCsv(meter: LlmMeter, filepath: string): void {
  const providerRollup = meter.breakdown;
  const providers = Object.keys(providerRollup).sort();

  const rows: string[] = [];
  rows.push("provider,calls,tokens,input_tokens,output_tokens,cost_usd");
  for (const provider of providers) {
    const u = providerRollup[provider]!;
    rows.push(
      [provider, u.calls, u.tokens, u.inputTokens, u.outputTokens, u.costUsd.toFixed(6)].join(",")
    );
  }

  fs.writeFileSync(filepath, rows.join("\n"));
}

export function saveUsageJson(meter: LlmMeter, filepath: string): void {
  const providerRollup = meter.breakdown;
  const cacheRollup = meter.savings;

  const data = {
    total: meter.summary,
    by_provider: providerRollup,
    cache_stats: {
      hit_count: cacheRollup.hitCount,
      miss_count: cacheRollup.missCount,
      tokens_saved: cacheRollup.tokensSaved,
      usd_saved: cacheRollup.usdSaved
    }
  };

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

export function exportToPrometheus(meter: LlmMeter): string {
  const summary = meter.summary;
  const savings = meter.savings;
  const breakdown = meter.breakdown;

  let out = "";
  out += `# HELP llm_meter_calls_total Total LLM calls\n`;
  out += `# TYPE llm_meter_calls_total counter\n`;
  out += `llm_meter_calls_total ${summary.calls}\n\n`;

  out += `# HELP llm_meter_tokens_total Total tokens used\n`;
  out += `# TYPE llm_meter_tokens_total counter\n`;
  out += `llm_meter_tokens_total{type="input"} ${summary.inputTokens}\n`;
  out += `llm_meter_tokens_total{type="output"} ${summary.outputTokens}\n\n`;

  out += `# HELP llm_meter_cost_usd Total estimated cost in USD\n`;
  out += `# TYPE llm_meter_cost_usd counter\n`;
  out += `llm_meter_cost_usd ${summary.costUsd}\n\n`;

  out += `# HELP llm_meter_cache_hits_total Total LLM cache hits\n`;
  out += `# TYPE llm_meter_cache_hits_total counter\n`;
  out += `llm_meter_cache_hits_total ${savings.hitCount}\n\n`;

  out += `# HELP llm_meter_cache_misses_total Total LLM cache misses\n`;
  out += `# TYPE llm_meter_cache_misses_total counter\n`;
  out += `llm_meter_cache_misses_total ${savings.missCount}\n\n`;

  out += `# HELP llm_meter_tokens_saved_total Total tokens saved by caching\n`;
  out += `# TYPE llm_meter_tokens_saved_total counter\n`;
  out += `llm_meter_tokens_saved_total ${savings.tokensSaved}\n\n`;

  out += `# HELP llm_meter_usd_saved_total Total USD saved by caching\n`;
  out += `# TYPE llm_meter_usd_saved_total counter\n`;
  out += `llm_meter_usd_saved_total ${savings.usdSaved}\n\n`;

  // Per provider breakdown
  for (const [provider, stats] of Object.entries(breakdown)) {
    out += `llm_meter_provider_calls_total{provider="${provider}"} ${stats.calls}\n`;
    out += `llm_meter_provider_cost_usd{provider="${provider}"} ${stats.costUsd}\n`;
    out += `llm_meter_provider_tokens_total{provider="${provider}",type="input"} ${stats.inputTokens}\n`;
    out += `llm_meter_provider_tokens_total{provider="${provider}",type="output"} ${stats.outputTokens}\n`;
  }

  return out;
}


