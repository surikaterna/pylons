import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { capture } from "./pack-check.js";
import { FoundationError } from "./policy.js";

const paths = [
  ...new Set(capture(["git", "ls-files", "--modified", "--others", "--exclude-standard", "-z"], process.cwd()).split("\0").filter(Boolean)),
].sort();
const fingerprint = createHash("sha256");
for (const path of paths) {
  const bytes = await readFile(path);
  if (/ +\n|\t+\n/.test(bytes.toString())) throw new FoundationError(`Untracked/tracked whitespace failure: ${path}`);
  const hash = createHash("sha256").update(bytes).digest("hex");
  fingerprint.update(path).update("\0").update(hash).update("\n");
  console.log(`${hash} ${path}`);
}
console.log(`Fingerprint SHA256(sorted UTF-8 path + NUL + lowercase file SHA256 + LF): ${fingerprint.digest("hex")}; ${paths.length} files`);
