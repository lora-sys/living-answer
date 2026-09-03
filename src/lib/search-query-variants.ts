/**
 * Zhihu content search behaves like a keyword engine, not a semantic one.
 * A full academic question ("如何全面理解 X 的核心原理与适用场景？") tends to
 * return column articles, while the bare term ("X") returns the answers this
 * product is built on.  This module turns clarified wording into a short,
 * ordered list of keyword queries.
 *
 * Pure and deterministic: no network, no provider knowledge.
 *
 * @module search-query-variants
 */

export interface QueryVariantInput {
  readonly question: string;
  readonly refinedQuery: string;
  readonly alternatives?: readonly string[];
}

/** Includes the primary query, so four extra searches at most. */
export const MAX_QUERY_VARIANTS = 5;

const MIN_PHRASE_CHARS = 2;
const MAX_PHRASE_CHARS = 32;

const LEADING_INTERROGATIVES =
  /^(请问|请介绍|如何|怎样|怎么|什么是|什么叫|为什么|为啥|能不能|可不可以|是否可以|有没有|谁清楚|谁知道)/;

// Framing words that sit in front of the topic and read as verbs or hedges to
// a keyword engine: "全面理解X" should search as "X".
const LEADING_NOISE = [
  "常见的",
  "实际的",
  "一般的",
  "核心的",
  "关键的",
  "主要的",
  "基本的",
  "全面理解",
  "系统学习",
  "深入了解",
  "简单介绍",
  "全面",
  "系统",
  "完整",
  "深入",
  "详细",
  "具体",
  "常见",
  "理解",
  "了解",
  "认识",
  "介绍",
  "分析",
  "总结",
  "梳理",
  "讲讲",
  "聊聊",
  "看看",
  "学习",
  "掌握",
  "对比",
  "比较",
].sort((a, b) => b.length - a.length);

// Words that carry the "question" but not the "topic".  Longest first so
// "适用场景" is not eaten as "场景" and left dangling.
const TAIL_WORDS = [
  "适用场景",
  "使用方法",
  "最佳实践",
  "注意事项",
  "是什么",
  "有哪些",
  "怎么样",
  "核心原理",
  "区别",
  "差别",
  "差异",
  "原理",
  "机制",
  "场景",
  "用法",
  "方法",
  "办法",
  "要点",
  "重点",
  "问题",
  "总结",
  "概览",
  "介绍",
  "说明",
  "对比",
  "比较",
  "详解",
  "全解",
  "应用",
  "落地",
  "实践",
  "如何",
  "怎么",
].sort((a, b) => b.length - a.length);

const FILLER_WORDS = [
  "以及",
  "常见的",
  "实际的",
  "一般的",
  "核心的",
  "关键的",
  "主要的",
  "基本的",
  "的",
  "之",
  "与",
  "和",
  "及",
  "跟",
  "吗",
  "呢",
].sort((a, b) => b.length - a.length);

const STRIP_WORDS = [...TAIL_WORDS, ...FILLER_WORDS];

const EDGE_PUNCTUATION = String.raw`[\s，,、。；;：:!！?？（）()【】[\]"'“”]`;

const trimPunctuation = (value: string): string =>
  value
    .replace(new RegExp(`^${EDGE_PUNCTUATION}+`), "")
    .replace(new RegExp(`${EDGE_PUNCTUATION}+$`), "");

/** Drop bracketed asides so "React Server Components（RSC）" stays searchable. */
const stripBrackets = (value: string): string =>
  value.replace(/（[^）]*）/g, " ").replace(/\([^)]*\)/g, " ");

/** Consecutive ASCII runs read as product or protocol names. */
export const extractTechnicalTerms = (text: string): string => {
  const matches = text.match(/[A-Za-z][A-Za-z0-9+#._-]*/g) ?? [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const match of matches) {
    const key = match.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(match);
    if (kept.join(" ").length > MAX_PHRASE_CHARS) break;
  }
  return kept.join(" ");
};

/** Particles end a Chinese topic noun; cutting there keeps it searchable. */
const TOPIC_STOP = /[的和与及等在为有对从把被]/;

/**
 * The ASCII product name plus the Chinese topic noun attached to it.
 *
 * "Redis分布式锁" must not degrade to "Redis": the bare term returns every
 * Redis answer on the site and buries the question actually being asked.
 */
export const extractTermPhrase = (text: string): string => {
  const terms = extractTechnicalTerms(text);
  if (terms === "") return "";

  const lastTerm = terms.split(" ").pop() ?? "";
  const at = text.toLowerCase().lastIndexOf(lastTerm.toLowerCase());
  if (at < 0) return terms;

  const after = text.slice(at + lastTerm.length);
  const cjk = after.match(/^\s*([\p{Script=Han}]+)/u)?.[1] ?? "";
  const topic = cjk.split(TOPIC_STOP)[0] ?? "";

  return topic.length >= MIN_PHRASE_CHARS ? `${terms} ${topic}` : terms;
};

export const compactPhrase = (text: string): string => {
  let value = trimPunctuation(stripBrackets(text).replace(/\s+/g, " ").trim());
  if (value === "") return "";

  let previous = "";
  while (previous !== value) {
    previous = value;
    value = trimPunctuation(value.replace(LEADING_INTERROGATIVES, ""));
    for (const word of LEADING_NOISE) {
      if (value.length > word.length + 1 && value.startsWith(word)) {
        value = trimPunctuation(value.slice(word.length));
      }
    }
    for (const word of STRIP_WORDS) {
      if (value.length > word.length + 1 && value.endsWith(word)) {
        value = trimPunctuation(value.slice(0, value.length - word.length));
      }
    }
  }

  if (value.length > MAX_PHRASE_CHARS) {
    value = trimPunctuation(value.slice(0, MAX_PHRASE_CHARS));
  }
  return value;
};

const isUseful = (value: string): boolean => value.length >= MIN_PHRASE_CHARS;

/**
 * Ordered keyword queries, most faithful wording kept for last.
 *
 * Probed against the live endpoint: a clarified academic sentence returns
 * column articles only, while the bare term returns the answers this product
 * is built on.  So keyword forms go first and the untouched clarified query
 * becomes the final fallback instead of burning the first search on it.
 */
export const buildQueryVariants = (input: QueryVariantInput): string[] => {
  const primary = (input.refinedQuery || input.question || "").replace(/\s+/g, " ").trim();
  const alternatives = (input.alternatives ?? [])
    .map((alt) => (alt ?? "").trim())
    .filter((alt) => alt !== "");

  const seen = new Set<string>();
  const variants: string[] = [];
  const push = (candidate: string): void => {
    if (variants.length >= MAX_QUERY_VARIANTS) return;
    const value = candidate.replace(/\s+/g, " ").trim();
    if (!isUseful(value)) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(value);
  };

  // Precise compound term first, then the Chinese topic noun, then the bare
  // term.  The untouched wording keeps the final slot so a compaction mistake
  // cannot silently drop the question the user actually asked; anything left
  // over goes to the clarified alternatives as genuine broadening.
  const forms = [extractTermPhrase, compactPhrase, extractTechnicalTerms];
  const formBudget = primary === "" ? MAX_QUERY_VARIANTS : MAX_QUERY_VARIANTS - 1;
  for (const source of [primary, ...alternatives]) {
    if (variants.length >= formBudget) break;
    for (const form of forms) {
      if (variants.length >= formBudget) break;
      push(form(source));
    }
  }
  push(primary);
  for (const alt of alternatives) push(alt);
  return variants;
};
