export class LoadError extends Error {
  constructor(readonly code: "load-failed" | "integrity-mismatch" | "cancelled") {
    super(code);
  }
}

async function boundedBody(response: Response, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new LoadError("load-failed");
  if (!response.body) throw new LoadError("load-failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) throw new LoadError("load-failed");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* Transport teardown cannot replace the safe failure. */
    }
    reader.releaseLock();
  }
}

export async function checkedBytes(entry: string, digest: string, maximum: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(entry, { redirect: "error", credentials: "omit", signal });
  try {
    if (response.status !== 200 || response.url !== entry || response.redirected) throw new LoadError("load-failed");
    const bytes = await boundedBody(response, maximum);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const actual = [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== digest) throw new LoadError("integrity-mismatch");
    // Fatal decoding prevents SDK text() replacing malformed UTF-8 before evaluation.
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (signal.aborted) throw new LoadError("cancelled");
    return bytes;
  } finally {
    try {
      await response.body?.cancel();
    } catch {
      /* Reader owns normal stream cleanup. */
    }
  }
}
