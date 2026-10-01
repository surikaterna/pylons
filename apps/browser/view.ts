import { DemoError, tenant, document as validDocument } from "../shared/domain.js";
import type { DemoHost } from "../shared/host.js";
import { diagnostics } from "../shared/logging.js";
import { LifecycleView } from "./lifecycle-view.js";
import { ViewRequests } from "./view-requests.js";

export function attachView(host: DemoHost): void {
  const form = document.getElementById("validation-form");
  if (!(form instanceof HTMLFormElement)) throw new Error("demo-view-invalid");
  const controller = new AbortController();
  host.own(() => controller.abort());
  const requests = new ViewRequests(host);
  const lifecycle = new LifecycleView();
  const options = { signal: controller.signal };
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      void validate(host, form, lifecycle);
    },
    options,
  );
  document.getElementById("load-fixture")?.addEventListener(
    "click",
    () => {
      void loadFixture(host, form, requests);
    },
    options,
  );
  document.getElementById("refresh")?.addEventListener(
    "click",
    () => {
      void refresh(host, form, lifecycle);
    },
    options,
  );
  for (const scope of ["a", "b"] satisfies readonly ("a" | "b")[]) {
    const subscription = host.scoped(scope).onState(() => lifecycle.render(host, form));
    host.own(() => subscription.dispose());
  }
  document.getElementById("tenant")?.addEventListener("change", () => lifecycle.render(host, form), options);
  document.getElementById("lifecycle-filter")?.addEventListener("change", () => lifecycle.render(host, form), options);
  const subscription = host.onDiagnostics(() => lifecycle.render(host, form));
  host.own(() => subscription.dispose());
  lifecycle.render(host, form);
  attachShutdown(host, options);
}
function attachShutdown(host: DemoHost, options: { readonly signal: AbortSignal }): void {
  document.getElementById("shutdown")?.addEventListener(
    "click",
    () => {
      status(host, "Shut down.");
      void host.shutdown().catch(() => diagnostics.write({ level: "error", code: "cleanup-failed" }));
    },
    options,
  );
}
async function validate(host: DemoHost, form: HTMLFormElement, lifecycle: LifecycleView): Promise<void> {
  if (host.closed) return;
  status(host, "Validating locally");
  const data = new FormData(form);
  const scope = data.get("tenant");
  const user = data.get("session");
  if (!tenant(scope) || !(user === "alice" || user === "bob")) return;
  try {
    const result = await host.validate(`${scope}-${user}`, { title: String(data.get("title") ?? ""), reference: String(data.get("reference") ?? "") });
    status(host, result.code === 0 ? "Valid" : result.code === 1 ? "Invalid" : "Infrastructure or authorization failed");
    lifecycle.render(host, form);
  } catch {
    status(host, "Infrastructure or authorization failed");
  }
}
async function loadFixture(host: DemoHost, form: HTMLFormElement, requests: ViewRequests): Promise<void> {
  if (host.closed) return;
  const request = requests.start();
  status(host, "Loading document fixture.");
  try {
    const response = await fetch("/documents/long", { signal: request.signal });
    if (!response.ok) throw new DemoError();
    const value: unknown = await response.json();
    if (!validDocument(value) || typeof value.reference !== "string") throw new DemoError();
    if (!requests.current(request)) return;
    const title = form.elements.namedItem("title");
    const reference = form.elements.namedItem("reference");
    if (title instanceof HTMLInputElement) title.value = value.title;
    if (reference instanceof HTMLInputElement) reference.value = value.reference;
    status(host, "Document fixture loaded.");
  } catch {
    if (requests.current(request)) status(host, "Document fixture unavailable.");
  } finally {
    requests.finish(request);
  }
}
async function refresh(host: DemoHost, form: HTMLFormElement, lifecycle: LifecycleView): Promise<void> {
  if (host.closed) return;
  const scope = new FormData(form).get("tenant");
  try {
    if (tenant(scope)) await host.scoped(scope).refresh();
    lifecycle.render(host, form);
  } catch {
    status(host, "Metadata unavailable.");
  }
}
function status(host: DemoHost, message: string): void {
  if (!host.closed) document.getElementById("status")?.replaceChildren(message);
}
