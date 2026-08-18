import test from "node:test";
import assert from "node:assert/strict";
import {
  LlmMeter,
  RedisCache,
  exportToPrometheus,
  createExpressBudgetMiddleware,
  estimateCostUsd
} from "../dist/index.mjs";

test("improvements: RedisCache works", async () => {
  const store = new Map();
  const mockRedis = {
    get: async (k) => store.get(k),
    set: async (k, v, px, ttl) => {
      store.set(k, v);
    },
    scan: async (cursor, match, pat, count, c) => {
      return ["0", Array.from(store.keys())];
    },
    del: async (...keys) => {
      for (const k of keys) store.delete(k);
    }
  };

  const cache = new RedisCache({ client: mockRedis, ttlMs: 1000 });
  const key = cache.makeKey({ prompt: "hello" });
  
  await cache.set(key, { result: "world" });
  const val = await cache.get(key);
  assert.deepEqual(val, { result: "world" });

  await cache.clear();
  const clearedVal = await cache.get(key);
  assert.equal(clearedVal, undefined);
});

test("improvements: rateResolver customization", () => {
  const meter = new LlmMeter({
    rateResolver: (model) => {
      if (model === "custom-crazy-model") {
        return { inputPer1k: 0.1, outputPer1k: 0.2 };
      }
      return undefined;
    }
  });

  meter.record({
    model: "custom-crazy-model",
    inputTokens: 1000,
    outputTokens: 1000,
    provider: "openai"
  });

  assert.ok(Math.abs(meter.summary.costUsd - 0.3) < 1e-9);
});

test("improvements: prompt caching cost calculation", () => {
  // deepseek-chat inputPer1k: 0.00027, cachedInputPer1k: 0.00007, outputPer1k: 0.0011
  // 1000 input tokens (500 cached), 500 output tokens
  // Cost: (500/1000)*0.00027 + (500/1000)*0.00007 + (500/1000)*0.0011
  // Cost: 0.000135 + 0.000035 + 0.00055 = 0.00072
  const cost = estimateCostUsd("deepseek-chat", 1000, 500, 500);
  assert.equal(cost, 0.00072);

  const meter = new LlmMeter();
  meter.record({
    model: "deepseek-chat",
    inputTokens: 1000,
    outputTokens: 500,
    cachedTokens: 500,
    provider: "deepseek"
  });
  assert.equal(meter.summary.costUsd, 0.00072);
});

test("improvements: Prometheus exporter output", () => {
  const meter = new LlmMeter();
  meter.record({
    model: "gpt-4o",
    inputTokens: 100,
    outputTokens: 50,
    provider: "openai"
  });
  meter.noteCacheHit(10, 0.01);
  meter.noteCacheMiss();

  const metrics = exportToPrometheus(meter);
  assert.ok(metrics.includes("llm_meter_calls_total 1"));
  assert.ok(metrics.includes("llm_meter_cache_hits_total 1"));
  assert.ok(metrics.includes("llm_meter_cache_misses_total 1"));
  assert.ok(metrics.includes('llm_meter_provider_calls_total{provider="openai"} 1'));
});

test("improvements: Express middleware", async () => {
  const meter = new LlmMeter();
  const middleware = createExpressBudgetMiddleware({
    maxCostUsd: 0.01,
    meter
  });

  const req = {};
  const res = {
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (body) => {
      res.body = body;
    }
  };

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
    req.llmBudget.meter.record({
      model: "gpt-4o",
      inputTokens: 10000, // Cost is 0.025, which exceeds 0.01
      outputTokens: 0,
      provider: "openai"
    });
  });

  // Since limits are checked when running, throwing cost cap exceeded happens inside budget.run
  // Let's yield execution so async tasks run
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(nextCalled);
  assert.equal(res.statusCode, 402);
  assert.ok(res.body.message.includes("Spending cap exceeded"));
});
