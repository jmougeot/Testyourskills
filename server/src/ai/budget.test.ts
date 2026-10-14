import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiAvailable, aiCostToday, costOf, recordUsage, resetBudgetForTests } from "./budget";
import { readCode } from "./readCode";
import { fakeClient } from "./testing";

const saved = { key: process.env.OPENROUTER_API_KEY, budget: process.env.AI_DAILY_BUDGET_USD };

beforeEach(() => resetBudgetForTests());
afterEach(() => {
  if (saved.key === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = saved.key;
  if (saved.budget === undefined) delete process.env.AI_DAILY_BUDGET_USD;
  else process.env.AI_DAILY_BUDGET_USD = saved.budget;
});

describe("budget", () => {
  it("calcule le coût Haiku 4.5 avec le cache", () => {
    // 1 M en entrée à 1 $, 1 M en lecture de cache à 0,1 $, 1 M en sortie à 5 $.
    // prompt_tokens inclut les tokens lus en cache.
    const usd = costOf("anthropic/claude-haiku-4.5", {
      prompt_tokens: 2e6,
      completion_tokens: 1e6,
      prompt_tokens_details: { cached_tokens: 1e6, cache_write_tokens: 0 },
    });
    expect(usd).toBeCloseTo(6.1, 6);
  });

  it("prend le coût d'OpenRouter tel quel quand il est donné", () => {
    expect(costOf("anthropic/claude-haiku-4.5", { prompt_tokens: 1e6, completion_tokens: 1e6, cost: 0.0123 })).toBe(0.0123);
  });

  it("cumule la consommation du jour", () => {
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 1100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 1000 } });
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 100, completion_tokens: 50 });
    const t = aiCostToday();
    expect(t.calls).toBe(2);
    expect(t.inputTokens).toBe(1200);
    expect(t.outputTokens).toBe(100);
    expect(t.usd).toBeGreaterThan(0);
  });

  it("aiAvailable exige la clé et un budget restant", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(aiAvailable()).toBe(false);
    process.env.OPENROUTER_API_KEY = "test";
    process.env.AI_DAILY_BUDGET_USD = "0.01";
    expect(aiAvailable()).toBe(true);
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 0, completion_tokens: 10_000 }); // 0,05 $
    expect(aiAvailable()).toBe(false);
  });

  it("n'appelle plus l'IA une fois le budget du jour dépassé", async () => {
    process.env.AI_DAILY_BUDGET_USD = "0";
    const { client, calls } = fakeClient([{}]);
    const res = await readCode([{ repo: "r", activity: 1, files: [{ path: "a.ts", content: "export {}" }] }], { client });
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
