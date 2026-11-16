import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardQuery, dashboardRangeError, legacyDashboardHref } from "../lib/dify-dashboard.ts";

test("dashboard links preserve independent log and comparison pages with literal filter values", () => {
  const query = dashboardQuery({ course: "机器学习 & 课程=2", credential_id: "unassigned", started_from: "2026-11-16T00:00:00+08:00", student: " a_b% " }, { page: 3, group_by: "course", group_page: 2 });
  const params = new URLSearchParams(query);
  assert.equal(params.get("course"), "机器学习 & 课程=2");
  assert.equal(params.get("student"), "a_b%");
  assert.equal(params.get("started_from"), "2026-11-16T00:00:00+08:00");
  assert.equal(params.get("page"), "3");
  assert.equal(params.get("group_page"), "2");
  assert.equal(params.get("group_by"), "course");
});

test("applying a new filter scope resets both paginations and retains comparison dimension", () => {
  const params = new URLSearchParams(dashboardQuery({ course: "新课程" }, { group_by: "course" }));
  assert.equal(params.get("page"), "1");
  assert.equal(params.get("group_page"), "1");
  assert.equal(params.get("group_by"), "course");
});

test("legacy routes preserve query values, repeated parameters and target section", () => {
  const target = legacyDashboardHref({ page: "2", group_page: "3", course: ["机器学习", "课程 & 二"], absent: undefined }, "call-logs");
  const url = new URL(target, "https://example.test");
  assert.equal(url.pathname, "/admin/dashboard");
  assert.equal(url.hash, "#call-logs");
  assert.deepEqual(url.searchParams.getAll("course"), ["机器学习", "课程 & 二"]);
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("group_page"), "3");
  assert.equal(url.searchParams.has("absent"), false);
});

test("invalid and inverted ranges cannot request inconsistent dashboard scopes", () => {
  for (const input of [{}, { started_from: "bad", started_before: "bad" }, { started_from: "2026-11-17T00:00:00+08:00", started_before: "2026-11-16T00:00:00+08:00" }]) assert(dashboardRangeError(input));
});

test("366 Beijing dates are accepted, including partial days and foreign offsets", () => {
  assert.equal(dashboardRangeError({ started_from: "2024-01-01T00:00:00+08:00", started_before: "2024-12-31T23:59:59+08:00" }), "");
  assert(dashboardRangeError({ started_from: "2024-01-01T00:00:00+08:00", started_before: "2025-01-01T00:00:00+08:00" }));
  assert.equal(dashboardRangeError({ started_from: "2026-11-15T23:00:00-05:00", started_before: "2026-11-17T00:00:00+08:00" }), "");
});

test("identical start and end include exactly the selected instant", () => {
  assert.equal(dashboardRangeError({ started_from: "2026-11-16T00:00:00+08:00", started_before: "2026-11-15T16:00:00Z" }), "");
});
