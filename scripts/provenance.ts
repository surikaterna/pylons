import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { FoundationError } from "./policy.js";

export const docsRevision = "6169eb215dadbafd547096edef87240911648344";
export const ghostBlobs = `https://github.com/spralle/ghost/blob/${docsRevision}/docs/architecture/`;
interface SpecSource {
  readonly file: string;
  readonly sha256: string;
}

export const specSources: readonly SpecSource[] = [
  { file: "plugin-runtime-0.1-prd.md", sha256: "2d77757d2adc09ab3d5c1c828d35d87c3853e9b44732d3569081a9f7ac0498a2" },
  { file: "plugin-runtime-0.1-arb.md", sha256: "c8935c7f0ef87631c51ca5c7eb5c22eb9319ed90c7f9374f8c179371387d7571" },
  { file: "plugin-runtime-future-directions.md", sha256: "609802ae961b4f653ce2c8b75d0d1d20decd674050750fa86125db1710bd08e0" },
];

export function attribution(file: string): string {
  return [
    "> Transferred from Ghost; Copyright (c) Surikaterna; owner-approved MIT.",
    `> Source: [docs/architecture/${file}](${ghostBlobs}${file}).`,
    "> Only attribution and uncopied relative-link targets changed; see [provenance](../provenance.md).",
    "",
    "",
  ].join("\n");
}

export function verifyTransfer(text: string, file: string, expectedHash: string): void {
  const notice = attribution(file);
  if (!text.includes(notice)) throw new FoundationError("Missing exact transfer attribution");
  const restored = text.replace(notice, "").replaceAll(ghostBlobs, "./");
  const actual = createHash("sha256").update(restored).digest("hex");
  if (actual !== expectedHash) throw new FoundationError("Transferred proposal differs beyond recorded transformations");
}

function headingAnchors(text: string): readonly string[] {
  return [...text.matchAll(/^#+ (.+)$/gm)].map((match) =>
    (match[1] ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]/gu, "")
      .replace(/ /g, "-"),
  );
}

export async function verifyLocalLinks(text: string, file: string): Promise<void> {
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const url = match[1];
    if (!url || /^https?:/.test(url)) continue;
    const [path, anchor] = url.split("#");
    const target = resolve(dirname(file), path || "");
    if (!(await stat(target)).isFile()) throw new FoundationError("Local documentation link is not a file");
    if (anchor && !headingAnchors(await readFile(target, "utf8")).includes(anchor)) {
      throw new FoundationError("Missing local documentation anchor");
    }
  }
}

export async function verifySpecs(root: string): Promise<void> {
  for (const source of specSources) {
    const file = resolve(root, "docs/architecture", source.file);
    const text = await readFile(file, "utf8");
    verifyTransfer(text, source.file, source.sha256);
    await verifyLocalLinks(text, file);
  }
}
