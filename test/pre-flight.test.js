import test from "node:test";
import assert from "node:assert/strict";
import {
  LlmMeter,
  cap,
  CostLimitExceeded,
  TokenCapExceeded
} from "../dist/index.mjs";
import {
  estimateTextTokens,
  extractOpenAiText,
  extractAnthropicText,
  extractGeminiText
} from "../src/tokenEstimation.ts";

test("pre-flight: extract text from request payloads", () => {
  // OpenAI
  const openaiReq = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helper." },
      { role: "user", content: "Hello world" }
    ]
  };
  assert.equal(extractOpenAiText(openaiReq), "You are a helper. Hello world");

  // Anthropic
  const anthropicReq = {
    model: "claude-3-opus",
    system: "Be polite",
    messages: [{ role: "user", content: "Hi" }]
  };
  assert.equal(extractAnthropicText(anthropicReq), "Be polite Hi");

  // Gemini
  const geminiReq = {
    contents: [
      { parts: [{ text: "Gemini contents" }] }
    ],
    systemInstruction: "Strict rules"
  };
  assert.equal(extractGeminiText(geminiReq), "Gemini contents Strict rules");
});

test("pre-flight: estimate text tokens baseline vs custom", () => {
  const text = "Hello world"; // 11 chars
  assert.equal(estimateTextTokens(text), 3); // Math.ceil(11/4) = 3

  const meter = new LlmMeter({
    estimateTokens: (str) => str.length * 10
  });
  assert.equal(meter.estimateTokens(text), 110);
});

test("pre-flight: cap rejects request pre-flight on tokens limit", async () => {
  const meter = new LlmMeter();
  const openaiClient = meter.instrumentOpenAI({
    chat: {
      completions: {
        create: async () => {
          // Should not reach this point
          assert.fail("Should have thrown error pre-flight!");
        }
      }
    }
  });

  let errorThrown = false;
  try {
    await cap({ maxTokens: 10, meter }).run(async () => {
      // 100 characters => estimated 25 tokens, which exceeds maxTokens: 10
      await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "a".repeat(100) }]
      });
    });
  } catch (e) {
    if (e instanceof TokenCapExceeded) {
      errorThrown = true;
      assert.ok(e.message.includes("Pre-flight token cap exceeded"));
    }
  }

  assert.ok(errorThrown);
});

test("pre-flight: cap rejects request pre-flight on cost limit", async () => {
  const meter = new LlmMeter();
  const openaiClient = meter.instrumentOpenAI({
    chat: {
      completions: {
        create: async () => {
          assert.fail("Should have thrown error pre-flight!");
        }
      }
    }
  });

  let errorThrown = false;
  try {
    // Max cost: 0.0001 USD.
    // gpt-4o rate: input: 0.0025 per 1k.
    // 100,000 characters => estimated 25,000 tokens. Cost = 25 * 0.0025 = 0.0625 USD, exceeding 0.0001 USD.
    await cap({ maxCostUsd: 0.0001, meter }).run(async () => {
      await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "a".repeat(100000) }]
      });
    });
  } catch (e) {
    if (e instanceof CostLimitExceeded) {
      errorThrown = true;
      assert.ok(e.message.includes("Pre-flight spending cap exceeded"));
    }
  }

  assert.ok(errorThrown);
});
