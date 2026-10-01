import { join } from "node:path";
import type { Host } from "@pylons/contracts";
import { chromium, type Page } from "playwright-core";
import { object } from "../apps/shared/domain.js";
import { serverClient } from "./demo-server.js";
import { FoundationError } from "./policy.js";

export interface Client {
  command(value: Record<string, unknown>): Promise<unknown>;
  close(expected?: number): Promise<{ readonly exit?: number; readonly browserClosed?: boolean; readonly blobScripts?: number; readonly blobUrls?: number }>;
  readonly url?: string;
  readonly page?: Page;
}
function child(origin: string) {
  return Bun.spawn([process.execPath, join(process.cwd(), ".demo-build/hosts/cli.js"), origin, "--session"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 12000,
  });
}
class Lines {
  private readonly queued: string[] = [];
  private readonly waiting: ((line: string) => void)[] = [];
  constructor(stream: ReadableStream<Uint8Array<ArrayBuffer>>) {
    void this.read(stream);
  }
  private async read(stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<void> {
    const reader = stream.getReader();
    let buffer = "";
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffer += new TextDecoder().decode(next.value);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const waiter = this.waiting.shift();
        if (waiter) waiter(line);
        else this.queued.push(line);
      }
    }
    reader.releaseLock();
  }
  next(): Promise<string> {
    const line = this.queued.shift();
    return line === undefined ? new Promise((resolve) => this.waiting.push(resolve)) : Promise.resolve(line);
  }
}
export async function client(host: Host, origin: string): Promise<Client> {
  if (host === "browser") return browserClient(origin);
  if (host === "server") return serverClient(origin, { kind: "bounded", timeoutMilliseconds: 12000 });
  const process = child(origin);
  const lines = new Lines(process.stdout);
  const errors = new Response(process.stderr).text();
  const ready: unknown = JSON.parse(await lines.next());
  if (!object(ready)) throw new FoundationError("demo-client-startup");
  let sequence = 0;
  const pending = new Map<number, (value: unknown) => void>();
  void replies(lines, pending);
  return {
    command: (value) =>
      new Promise((resolve) => {
        const id = ++sequence;
        pending.set(id, resolve);
        process.stdin.write(`${JSON.stringify({ ...value, id })}\n`);
        process.stdin.flush();
      }),
    close: async (expected = 0) => {
      process.stdin.end();
      const exit = await process.exited;
      if (exit !== expected || (await errors).includes("SENTINEL")) throw new FoundationError("demo-cli-native-exit");
      return { exit };
    },
  };
}
async function replies(lines: Lines, pending: Map<number, (value: unknown) => void>): Promise<void> {
  while (true) {
    const value: unknown = JSON.parse(await lines.next());
    if (!object(value) || typeof value.id !== "number") throw new FoundationError("demo-cli-reply");
    pending.get(value.id)?.(value.response);
    pending.delete(value.id);
  }
}
async function browserClient(origin: string): Promise<Client> {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const urls = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      urls.delete(url);
      revoke(url);
    };
    Reflect.set(globalThis, "__demoBlobCount", () => urls.size);
  });
  await page.goto(new URL("browser", origin).href);
  await page.waitForFunction(() => typeof Reflect.get(globalThis, "__demoHost") === "object");
  await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("Metadata ready"));
  return {
    page,
    command: (value) =>
      page.evaluate(async (input) => {
        const host: unknown = Reflect.get(globalThis, "__demoHost");
        if (!host || typeof host !== "object") throw new Error("demo-host-missing");
        const command: unknown = Reflect.get(host, "command");
        if (typeof command !== "function") throw new Error("demo-command-missing");
        return command.call(host, input);
      }, value),
    close: async () => {
      const blobScripts = await page.locator('script[src^="blob:"]').count();
      const blobUrls = await page.evaluate(() => {
        const read: unknown = Reflect.get(globalThis, "__demoBlobCount");
        return typeof read === "function" ? Number(read()) : -1;
      });
      if (blobScripts !== 0 || blobUrls !== 0) throw new FoundationError("demo-browser-script-leak");
      await browser.close();
      return { browserClosed: true, blobScripts, blobUrls };
    },
  };
}
