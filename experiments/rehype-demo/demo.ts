import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import type { Root, Element, Text, Comment, RootContent } from "hast";
import type { Root as MdastRoot } from "mdast";

type CompactNode =
  | { type: "element"; tag: string; attrs?: Record<string, string>; children: CompactNode[] }
  | { type: "text"; value: string }
  | { type: "comment"; value: string };

function toCompact(node: RootContent | Root): CompactNode | null {
  if (node.type === "element") {
    const el = node as Element;
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(el.properties ?? {})) {
      if (v == null || v === false) continue;
      attrs[k] = Array.isArray(v) ? v.join(" ") : String(v);
    }
    return {
      type: "element",
      tag: el.tagName,
      ...(Object.keys(attrs).length ? { attrs } : {}),
      children: el.children
        .map(toCompact)
        .filter((c): c is CompactNode => c !== null),
    };
  }
  if (node.type === "text") {
    const t = node as Text;
    if (!t.value.trim()) return null;
    return { type: "text", value: t.value };
  }
  if (node.type === "comment") {
    return { type: "comment", value: (node as Comment).value };
  }
  return null;
}

function parseToHast(html: string): Root {
  return unified()
    .use(rehypeParse, { fragment: true })
    .parse(html) as Root;
}

function parseToSanitizedHast(html: string): Root {
  const tree = parseToHast(html);
  return unified()
    .use(rehypeSanitize, {
      ...defaultSchema,
      tagNames: [...(defaultSchema.tagNames ?? []), "img", "figure", "figcaption"],
      attributes: {
        ...defaultSchema.attributes,
        img: ["src", "alt", "width", "height", "srcset"],
        "*": ["className"],
      },
    })
    .runSync(tree) as Root;
}

async function toMarkdown(html: string): Promise<string> {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkStringify)
    .process(html);
  return String(file);
}

async function toMdast(html: string): Promise<MdastRoot> {
  const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeRemark);
  const hast = processor.parse(html);
  return (await processor.run(hast)) as MdastRoot;
}

async function loadInput(): Promise<{ source: string; html: string }> {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: bun run demo.ts <path-to-html-file>");
    process.exit(1);
  }
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`file not found: ${path}`);
    process.exit(1);
  }
  return { source: path, html: await file.text() };
}

function section(title: string): void {
  const bar = "─".repeat(Math.max(0, 60 - title.length));
  console.log(`\n── ${title} ${bar}`);
}

async function main(): Promise<void> {
  const { source, html } = await loadInput();
  console.log(`Source: ${source}`);
  console.log(`Bytes:  ${Buffer.byteLength(html, "utf8")}`);

  section("Raw HAST (rehype-parse, first 1500 chars)");
  const hast = parseToHast(html);
  const hastJson = JSON.stringify(hast, null, 2);
  console.log(hastJson.length > 1500 ? hastJson.slice(0, 1500) + "\n... (truncated)" : hastJson);

  section("Sanitized HAST (rehype-sanitize)");
  const sanitized = parseToSanitizedHast(html);
  const sanitizedJson = JSON.stringify(sanitized, null, 2);
  console.log(sanitizedJson.length > 1500 ? sanitizedJson.slice(0, 1500) + "\n... (truncated)" : sanitizedJson);

  section("Compact node tree (custom shape)");
  const compact = toCompact(sanitized);
  console.log(JSON.stringify(compact, null, 2));

  section("MDAST (HTML -> semantic node tree, no markdown string)");
  const mdast = await toMdast(html);
  const mdastJson = JSON.stringify(mdast, null, 2);
  console.log(mdastJson.length > 2000 ? mdastJson.slice(0, 2000) + "\n... (truncated)" : mdastJson);

  section("Markdown (rehype-remark)");
  console.log(await toMarkdown(html));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
