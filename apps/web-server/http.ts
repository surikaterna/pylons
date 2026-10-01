import { resolve } from "node:path";
import { authenticate } from "../shared/authority.js";
import { object } from "../shared/domain.js";
import type { DemoHost } from "../shared/host.js";
import { readJson } from "../shared/http-json.js";

export async function handle(host: DemoHost, request: Request, stop: () => void): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/__demo" && request.headers.get("authorization") === "Bearer demo-operator") {
      const value = await readJson(request);
      const result = await host.command(value);
      if (object(value) && value.op === "exit") stop();
      return Response.json(result);
    }
    const credential = authenticate(request.headers.get("authorization")?.replace(/^Bearer /, ""));
    if (!credential) return Response.json({ error: "unauthorized" }, { status: 401 });
    const claimed = url.searchParams.get("tenant");
    if (claimed && claimed !== credential.tenant) return Response.json({ error: "denied" }, { status: 403 });
    if (url.pathname === "/metadata") return Response.json(await host.discover(credential.tenant));
    if (url.pathname === "/validate" || url.pathname === "/fixture-validate") {
      if (host.scoped(credential.tenant).metadata().length === 0) await host.discover(credential.tenant);
      await host.scoped(credential.tenant).startup();
      const name = url.searchParams.get("name") ?? "long";
      if (!["short", "long", "empty", "no-reference"].includes(name)) return Response.json({ error: "input-failed" }, { status: 400 });
      const input: unknown =
        url.pathname === "/validate"
          ? await readJson(request)
          : JSON.parse(await Bun.file(resolve(import.meta.dir, `../../tests/demo/documents/${name}.json`)).text());
      const result = await host.validate(credential.subject, input);
      return Response.json(result, { status: result.code === 0 ? 200 : result.code === 1 ? 422 : 503 });
    }
    return new Response(null, { status: 404 });
  } catch {
    return Response.json({ error: "request-failed" }, { status: 503 });
  }
}
