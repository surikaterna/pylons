import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanOwnedOutput, verifyOutputs } from "../scripts/build-output.js";
import { verifyPackages } from "../scripts/inventory.js";
import { FoundationError, foundationManifest, rejectRuntimeLinks, validateManifest } from "../scripts/policy.js";
import { run } from "../scripts/process.js";
import { specSources, verifyLocalLinks, verifySpecs, verifyTransfer } from "../scripts/provenance.js";

async function fixture(action: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "pylons-foundation-test-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify(foundationManifest));
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("foundation policy", () => {
  test("accepts the private pinned foundation", () => {
    expect(() => validateManifest(foundationManifest)).not.toThrow();
  });
  test.each([{ value: null }, { value: [] }, { value: "manifest" }, { value: 1 }])("rejects nonobjects: %p", ({ value }) => {
    expect(() => validateManifest(value)).toThrow(FoundationError);
  });
  test.each([
    { private: false },
    { packageManager: "bun@latest" },
    { devDependencies: { ...foundationManifest.devDependencies, typescript: "^5.9.3" } },
    { scripts: { ...foundationManifest.scripts, build: "echo success" } },
    { dependencies: { demo: "1.0.0" } },
    { exports: "./runtime.js" },
    { workspaces: ["packages/*"] },
  ])("rejects unauthorized manifest variation: %p", (variation) => {
    expect(() => validateManifest({ ...foundationManifest, ...variation })).toThrow(FoundationError);
  });
  test.each(["workspace:*", "file:../ghost", "link:../ghost"])("rejects runtime link %s", (version) => {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      expect(() => rejectRuntimeLinks({ [field]: { demo: version } })).toThrow(FoundationError);
    }
  });
});

describe("actual manifest inventory", () => {
  test("counts only real root manifest and ignores dependency infrastructure", async () => {
    await fixture(async (root) => {
      await mkdir(join(root, "node_modules"));
      await writeFile(join(root, "node_modules/package.json"), "{}");
      expect(await verifyPackages(root)).toEqual([join(root, "package.json")]);
    });
  });
  test("rejects unexpected nested publishable AND private manifests", async () => {
    await fixture(async (root) => {
      await mkdir(join(root, "packages"));
      for (const privateValue of [false, true]) {
        await writeFile(join(root, "packages/package.json"), JSON.stringify({ private: privateValue }));
        await expect(verifyPackages(root)).rejects.toThrow("Unexpected package");
      }
    });
  });
  test("rejects malformed JSON and missing root", async () => {
    await fixture(async (root) => {
      await writeFile(join(root, "package.json"), "{");
      await expect(verifyPackages(root)).rejects.toThrow();
      await rm(join(root, "package.json"));
      await expect(verifyPackages(root)).rejects.toThrow("Missing private root");
    });
  });
  test("rejects symlink traversal", async () => {
    await fixture(async (root) => {
      await symlink(tmpdir(), join(root, "escape"));
      await expect(verifyPackages(root)).rejects.toThrow("symbolic links");
    });
  });
});

describe("failure propagation", () => {
  test("runner rejects a nonzero subprocess", () => {
    expect(() => run([process.execPath, "-e", "process.exit(7)"], process.cwd())).toThrow(FoundationError);
  });
  test("CLI returns bounded failure for invalid fixture", async () => {
    await fixture(async (root) => {
      await writeFile(join(root, "package.json"), JSON.stringify({ private: false }));
      const entry = join(process.cwd(), "scripts/check.ts");
      const result = Bun.spawnSync([process.execPath, entry, root], { timeout: 10_000 });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("Foundation check failed");
    });
  });
});

describe("foundation output ownership", () => {
  test("removes only owned stale output and preserves other files", async () => {
    await fixture(async (root) => {
      await mkdir(join(root, ".foundation-build"));
      await writeFile(join(root, ".foundation-build/stale.js"), "stale");
      await cleanOwnedOutput(root);
      await expect(readFile(join(root, ".foundation-build/stale.js"))).rejects.toThrow();
      expect(await readFile(join(root, "package.json"), "utf8")).toBe(JSON.stringify(foundationManifest));
    });
  });
  test("refuses linked owned output without deleting target", async () => {
    await fixture(async (root) => {
      await mkdir(join(root, "outside"));
      await writeFile(join(root, "outside/keep"), "keep");
      await symlink(join(root, "outside"), join(root, ".foundation-build"));
      await expect(cleanOwnedOutput(root)).rejects.toThrow("linked build");
      expect(await readFile(join(root, "outside/keep"), "utf8")).toBe("keep");
    });
  });
  test("rejects missing compiler outputs", async () => {
    await fixture(async (root) => {
      await mkdir(join(root, "scripts"));
      await writeFile(join(root, "scripts/check.ts"), "export const check = true;");
      await expect(verifyOutputs(root)).rejects.toThrow();
    });
  });
});

describe("provenance preservation", () => {
  test("all transferred proposals restore to source hashes and links resolve", async () => {
    await verifySpecs(process.cwd());
  });
  test("rejects proposal modification and removed attribution", async () => {
    for (const source of specSources) {
      const text = await readFile(join(process.cwd(), "docs/architecture", source.file), "utf8");
      expect(() => verifyTransfer(`${text}changed`, source.file, source.sha256)).toThrow(FoundationError);
      expect(() => verifyTransfer(text.replace("Copyright (c) Surikaterna", "unknown"), source.file, source.sha256)).toThrow(FoundationError);
    }
  });
  test("rejects missing local link files and anchors", async () => {
    await fixture(async (root) => {
      const file = join(root, "README.md");
      await writeFile(file, "# Valid heading\n");
      await verifyLocalLinks("[valid](README.md#valid-heading)", file);
      await expect(verifyLocalLinks("[bad](README.md#missing)", file)).rejects.toThrow("anchor");
      await expect(verifyLocalLinks("[bad](missing.md)", file)).rejects.toThrow();
    });
  });
});

test("inventory cannot hide nested manifests under infrastructure names", async () => {
  await fixture(async (root) => {
    await mkdir(join(root, "packages/.foundation-build"), { recursive: true });
    await writeFile(join(root, "packages/.foundation-build/package.json"), "{}");
    await expect(verifyPackages(root)).rejects.toThrow("Unexpected package");
  });
});

test("inventory bounds deep traversal", async () => {
  await fixture(async (root) => {
    await mkdir(join(root, "a/b/c/d/e/f/g/h/i"), { recursive: true });
    await expect(verifyPackages(root)).rejects.toThrow("depth");
  });
});
