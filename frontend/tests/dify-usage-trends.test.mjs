import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chartNumber,
  trendFilters,
  trendValue,
} from "../lib/dify-usage-trends.ts";

test("default thirty-day window crosses Beijing midnight independently of browser timezone", () => {
  const before = trendFilters({}, new Date("2026-11-15T15:59:59Z"));
  const after = trendFilters({}, new Date("2026-11-15T16:00:00Z"));
  assert.equal(before.started_before, "2026-11-15T15:59:59.000Z");
  assert.equal(after.started_before, "2026-11-16T15:59:59.000Z");
  assert.equal(after.started_from, "2026-10-17T16:00:00.000Z");
  assert.equal(
    Date.parse(after.started_before) - Date.parse(after.started_from),
    30 * 86400000 - 1000,
  );
});

test("explicit partial boundaries and other filter scopes are retained", () => {
  const input = {
    started_from: "2024-02-29T12:00:00+08:00",
    started_before: "2024-03-02T01:00:00+08:00",
    course: "机器学习",
  };
  assert.deepEqual(trendFilters(input), input);
});

test("chart values keep reported zero distinct from unknown", () => {
  const row = {
    total_calls: 2,
    prompt_tokens: 0,
    total_tokens: null,
    unknown_prompt_calls: 0,
    unknown_total_token_calls: 2,
    currencies: [],
  };
  assert.deepEqual(trendValue(row, "prompt_tokens", ""), {
    raw: "0",
    unknown: 0,
  });
  assert.deepEqual(trendValue(row, "total_tokens", ""), {
    raw: null,
    unknown: 2,
  });
  assert.deepEqual(trendValue(row, "total_calls", ""), {
    raw: "2",
    unknown: 0,
  });
});

test("currency selection keeps tiny exact prices and separates absent from unreported fees", () => {
  const tiny = "0.00000000000000000000000001";
  const row = {
    currencies: [
      { currency: "USD", total_price: tiny, unknown_price_calls: 1 },
      { currency: "CNY", total_price: null, unknown_price_calls: 2 },
    ],
  };
  assert.deepEqual(trendValue(row, "cost", "USD"), { raw: tiny, unknown: 1 });
  assert.deepEqual(trendValue(row, "cost", "CNY"), { raw: null, unknown: 2 });
  assert.deepEqual(trendValue(row, "cost", "EUR"), { raw: "0", unknown: 0 });
  assert.equal(trendValue(row, "cost", "").raw, null);
});

test("floating-point overflow and underflow leave gaps while exact zero remains visible", () => {
  assert.equal(chartNumber(null), null);
  assert.equal(chartNumber("1e1000"), null);
  assert.equal(chartNumber("1e-1000"), null);
  assert.equal(chartNumber("0E-1000"), 0);
  assert.equal(chartNumber("0.000000"), 0);
  assert.equal(chartNumber("0.000000000001"), 0.000000000001);
});
