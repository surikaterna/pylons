import type { DemoHost } from "../shared/host.js";
import { LifecycleLabels, type LifecycleRow } from "./lifecycle-model.js";

export class LifecycleView {
  private readonly labels = { a: new LifecycleLabels(), b: new LifecycleLabels() };

  render(host: DemoHost, form: HTMLFormElement): void {
    if (host.closed) return;
    const scope = new FormData(form).get("tenant") === "b" ? "b" : "a";
    const runtime = host.scoped(scope);
    const rows = this.labels[scope].project(runtime.snapshots(), runtime.metadata());
    const target = document.getElementById("lifecycle");
    if (!target) return;
    const heading = text("h3", `Tenant ${scope.toUpperCase()} · browser host`);
    const note = text(
      "p",
      "All retained generation snapshots for this tenant are listed below. Rows are not a claim of current selection; metadata labels describe the matching definition, not readiness.",
    );
    const cards = rows.map(card);
    target.replaceChildren(heading, note, ...cards);
    if (rows.length === 0) target.append(text("p", "No lifecycle snapshots available yet."));
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
  article.append(text("h4", `${generation.definition.pluginId} · ${snapshot.state}`), text("p", row.explanation));
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
