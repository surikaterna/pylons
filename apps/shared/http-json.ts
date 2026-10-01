import { DemoError } from "./domain.js";

export async function readJson(request: Request, maximumBytes = 20000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new DemoError();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new DemoError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
