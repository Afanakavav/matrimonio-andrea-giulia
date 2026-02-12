/**
 * Unit test: perf-check script runs without crashing
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

describe("perf-check", () => {
  it("runs and exits", () => {
    const root = path.join(__dirname, "..", "..");
    const result = spawnSync("node", ["scripts/perf-check.js"], {
      cwd: root,
      encoding: "utf8",
    });
    // Exit 0 = OK, 1 = warnings (acceptable)
    assert.ok(result.status === 0 || result.status === 1, "perf-check completed");
  });
});
