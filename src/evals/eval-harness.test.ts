import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import type { GoldenCase } from "./harness-types";

const DATASET_PATH = new URL("./datasets/golden-v1.jsonl", import.meta.url);
const MANIFEST_PATH = new URL("./datasets/manifest.json", import.meta.url);

const readGoldenCases = (): readonly GoldenCase[] =>
  readFileSync(DATASET_PATH, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as GoldenCase);

describe("golden eval dataset", () => {
  it("is frozen at the declared size and hash", () => {
    const dataset = readGoldenCases();
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      readonly dataset: string;
      readonly sha256: string;
      readonly cases: number;
      readonly frozen: true;
    };
    const hash = createHash("sha256").update(readFileSync(DATASET_PATH)).digest("hex");

    expect(manifest.frozen).toBe(true);
    expect(dataset).toHaveLength(manifest.cases);
    expect(hash).toBe(manifest.sha256);
    expect(manifest.dataset).toBe("./golden-v1.jsonl");
  });

  it("has stable ids, labels, difficulty and expected flow", () => {
    const dataset = readGoldenCases();
    const ids = new Set<string>();
    const categories = new Set<string>();
    const difficulties = new Set<string>();

    for (const item of dataset) {
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
      categories.add(item.category);
      difficulties.add(item.difficulty);
      expect(item.version).toBe(1);
      expect(item.id).toMatch(/^(rag|tool|multi|bug|adv)-[a-z0-9-]+$/);
      expect(item.title).not.toBe("");
      expect(["easy", "medium", "hard"]).toContain(item.difficulty);
      expect(["full", "safe_no_thread"]).toContain(item.expected.flow);
      expect(item.expected.requiredTools.length).toBeGreaterThan(0);
      expect(item.tags.length).toBeGreaterThan(0);
    }

    expect(ids.size).toBe(dataset.length);
    expect(categories).toEqual(
      new Set(["rag_qa", "tool_call", "multi_turn", "bug_regression", "adversarial"]),
    );
    expect(difficulties).toEqual(new Set(["easy", "medium", "hard"]));
  });
});

const DEFAULT_EVAL_TIMEOUT_MS = 4 * 60 * 60 * 1000;

describe("golden eval command", () => {
  it(
    "runs the frozen harness only when explicitly requested",
    async () => {
      if (process.env.EVAL_COMMAND !== "run") {
        expect(process.env.EVAL_COMMAND).toBeUndefined();
        return;
      }
  
      const { runGoldenEval } = await import("./run-eval");
      await runGoldenEval({
        limit: Number(process.env.EVAL_LIMIT ?? 12),
        offset: Number(process.env.EVAL_OFFSET ?? 0),
        category: process.env.EVAL_CATEGORY,
        judge: process.env.EVAL_JUDGE !== "false",
        filter: process.env.EVAL_FILTER,
        concurrency: Number(process.env.EVAL_CONCURRENCY ?? 1),
      });
      expect(process.env.EVAL_COMMAND).toBe("run");
    },
    // A full-set sweep is hours of real provider calls.  The previous one-hour
    // ceiling killed a 48-case batch before it could report anything.
    Number(process.env.EVAL_TIMEOUT_MS ?? DEFAULT_EVAL_TIMEOUT_MS),
  );
});
