import { object, plugins, tenant } from "../shared/domain.js";
import { readJson } from "../shared/http-json.js";
import type { ScopeState } from "./state.js";

export async function control(request: Request, scopes: { a: ScopeState; b: ScopeState }): Promise<Response> {
  if (request.headers.get("authorization") !== "Bearer demo-operator") return new Response(null, { status: 401 });
  const value = await readJson(request);
  if (!object(value) || !tenant(value.tenant)) return new Response(null, { status: 400 });
  const selected = scopes[value.tenant];
  if (typeof value.revision === "string" && value.revision.length <= 128) selected.revision = value.revision;
  for (const key of ["enabled", "authorized", "outage"] satisfies readonly ("enabled" | "authorized" | "outage")[]) {
    if (typeof value[key] === "boolean") selected[key] = value[key];
  }
  if (value.version === "1" || value.version === "2") selected.version = value.version;
  if (typeof value.until === "number" && Number.isFinite(value.until) && value.until > Date.now() && value.until <= Date.now() + 60000)
    selected.until = value.until;
  if (object(value.values)) patchValues(value.values, selected);
  return Response.json({ revision: selected.revision, enabled: selected.enabled, authorized: selected.authorized });
}
function patchValues(values: Record<string, unknown>, selected: ScopeState): void {
  for (const plugin of plugins) {
    const patch = values[plugin];
    if (!object(patch)) continue;
    for (const [key, field] of Object.entries(patch)) {
      if (typeof field === "string" || typeof field === "number" || typeof field === "boolean" || field === null) selected.values[plugin][key] = field;
    }
  }
}
