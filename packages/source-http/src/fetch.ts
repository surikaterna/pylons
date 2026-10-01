import type { Disposable, Result } from "@pylons/contracts";
import { release } from "./cancellation.js";
import type { HttpTransport, MetadataResponse, TransportFailure, TransportRequest } from "./types.js";

async function boundedBody(response: Response, maxBytes: number): Promise<string | undefined> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await response.body?.cancel();
    return undefined;
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) return undefined;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function fetchMetadata(request: TransportRequest): Promise<Result<MetadataResponse, TransportFailure>> {
  const controller = new AbortController();
  let subscription: Disposable | undefined;
  try {
    const url = new URL(request.endpoint.url);
    if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes <= 0 || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return { success: false, error: { code: "unavailable" } };
    }
    if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
    subscription = request.cancellation.onCancel(() => controller.abort());
    const response = await fetch(url, { method: "GET", headers: request.endpoint.headers, redirect: "manual", credentials: "omit", signal: controller.signal });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { success: true, data: { status: response.status, body: "" } };
    }
    const body = await boundedBody(response, request.maxBytes);
    if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
    return body === undefined ? { success: false, error: { code: "oversize" } } : { success: true, data: { status: response.status, body } };
  } catch {
    return { success: false, error: { code: controller.signal.aborted ? "cancelled" : "unavailable" } };
  } finally {
    controller.abort();
    release(subscription);
  }
}

export function createFetchTransport(): HttpTransport {
  return { read: fetchMetadata };
}
