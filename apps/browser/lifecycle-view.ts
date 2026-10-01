import { diagnosticView, eventLine } from "../shared/diagnostic-view.js";
import { type Tenant, tenants } from "../shared/domain.js";
import type { DemoHost } from "../shared/host.js";
import { LifecycleLabels, type LifecycleRow } from "./lifecycle-model.js";

export class LifecycleView {
  private readonly labels = { a: new LifecycleLabels(), b: new LifecycleLabels() };

  render(host: DemoHost, form: HTMLFormElement): void {
    if (host.closed) return;
    const scope = new FormData(form).get("tenant") === "b" ? "b" : "a";
    const filter = document.getElementById("lifecycle-filter");
    const scopes: readonly Tenant[] = filter instanceof HTMLSelectElement && filter.value === "selected" ? [scope] : tenants;
    const rows = scopes.flatMap((tenant) => {
      const runtime = host.scoped(tenant);
      return this.labels[tenant].project(runtime.snapshots(), runtime.metadata());
    });
    const target = document.getElementById("lifecycle");
    if (!target) return;
    const heading = text("h3", `Tenant ${scopes.length === 2 ? "A + B" : scope.toUpperCase()} · browser host`);
    const note = text(
      "p",
      "All retained generation snapshots for the displayed tenants are listed below. Rows are not a claim of current selection; metadata labels describe the matching definition, not readiness.",
    );
    const cards = rows.map(card);
    target.replaceChildren(heading, note, ...cards);
    if (rows.length === 0) target.append(text("p", "No lifecycle snapshots available yet."));
    this.diagnostics(host, scopes, target);
  }

  private diagnostics(host: DemoHost, scopes: readonly string[], target: HTMLElement): void {
    const view = diagnosticView(host);
    target.append(
      text("h3", "Discovery / source"),
      text("p", `Host-provided security capability: ${view.security ? "ready" : "not ready"} (not a remote plugin).`),
      text("p", "Last 4 source outcomes per displayed tenant; complete captured history remains in the private diagnostics report."),
    );
    for (const scope of scopes) {
      const outcomes = view.sources.filter((entry) => entry.scope === scope);
      if (!outcomes.length) target.append(text("p", `${scope.toUpperCase()}: no source outcome observed yet.`));
      for (const entry of outcomes.slice(-4))
        target.append(
          text(
            "p",
            `${scope.toUpperCase()} ${entry.operation}: ${entry.code} · ${entry.operationId} · ${new Date(entry.at).toISOString()} · ${entry.guidance}`,
          ),
        );
    }
    target.append(
      text("h3", "Lifecycle timeline"),
      text("p", "Last 40 observed events for displayed tenants, in capture order. This is a display window, not deletion of host history."),
    );
    const events = view.events.filter((entry) => {
      const value = entry.event.kind === "state-changed" ? entry.event.snapshot.generation : entry.event.generation;
      return scopes.includes(value.scope.tenantId);
    });
    const list = document.createElement("ol");
    list.id = "lifecycle-timeline";
    list.append(...events.slice(-40).map((entry) => text("li", eventLine(entry))));
    target.append(list);
  }
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

function field(list: HTMLDListElement, label: string, value: string): void {
  list.append(text("dt", label), text("dd", value));
}

function card(row: LifecycleRow): HTMLElement {
  const { snapshot } = row;
  const { generation } = snapshot;
  const article = document.createElement("article");
  article.className = "lifecycle-card";
  article.dataset.plugin = generation.definition.pluginId;
  article.dataset.state = snapshot.state;
  article.append(text("h4", `${generation.scope.tenantId.toUpperCase()} · ${generation.definition.pluginId} · ${snapshot.state}`), text("p", row.explanation));
  article.append(
    text("p", `Declared capabilities: ${row.capabilities === undefined ? "metadata unavailable" : row.capabilities.join(", ") || "none declared"}`),
  );
  if (snapshot.failureCode) article.append(text("p", `Failure code: ${snapshot.failureCode}`));
  const details = document.createElement("details");
  details.append(text("summary", "Generation, extension and revisions"));
  const list = document.createElement("dl");
  field(list, "Definition version", generation.definition.definitionVersion);
  field(list, "Extension", snapshot.extensionId ?? "not available");
  field(list, "Generation", generation.generationId);
  field(list, "Desired revision", generation.desiredRevision);
  field(list, "Applied revision", row.appliedRevision);
  field(list, "Host scope", generation.scope.hostId);
  field(list, "Tenant scope", generation.scope.tenantId);
  details.append(list);
  article.append(details);
  return article;
}
