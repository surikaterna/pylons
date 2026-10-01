import { LoggerFactory } from "slf";
import type { PluginDefinition } from "@pylons/contracts";
import type { activate } from "../../activation.js";
import { requestContext } from "../../request-context.js";
import { bounded } from "../../timeout.js";

type Session = Awaited<ReturnType<typeof activate>>;
type FailureCode = "request-failed" | "activation-failed" | "cleanup-failed" | "shutdown-failed";
const logger = LoggerFactory.getLogger("pylons:http");

export function observeHttpFailure(code: FailureCode): void {
  logger.error(`http ${code}`);
}

export function httpFailure(code: FailureCode): Response {
  observeHttpFailure(code);
  return Response.json({ error: { code } }, { status: 503 });
}

export class HttpBoundary {
  private demand: Promise<Session> | undefined;
  private closing = false;

  constructor(
    private readonly metadata: { readonly contributions: PluginDefinition["contributions"]; readonly selected: string },
    private readonly loadSession: () => Promise<Session>,
    private readonly stopServer: () => void,
    private readonly milliseconds = 6000,
  ) {}

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/shutdown") return await this.shutdown();
      if (this.closing) return httpFailure("request-failed");
      if (url.pathname === "/metadata") return Response.json(this.metadata);
      if (url.pathname === "/validate") return await this.validate(url.searchParams.get("title") ?? "");
      return new Response("not-found", { status: 404 });
    } catch {
      return httpFailure("request-failed");
    }
  }

  private async validate(title: string): Promise<Response> {
    this.demand ??= Promise.resolve().then(this.loadSession);
    const session = await bounded(this.demand, this.milliseconds);
    const result = await bounded(session.invoke({ title }, requestContext("server-call")), this.milliseconds);
    return Response.json({ result, counts: session.counts() });
  }

  private async shutdown(): Promise<Response> {
    if (this.closing) return httpFailure("shutdown-failed");
    this.closing = true;
    try {
      const session = await this.settleDemand();
      if (this.demand && !session) return httpFailure("shutdown-failed");
      try {
        if (session) await bounded(session.stop(), this.milliseconds);
        return Response.json({ counts: session?.counts() });
      } catch {
        observeHttpFailure("cleanup-failed");
        return httpFailure("shutdown-failed");
      }
    } finally {
      // Schedule owned transport teardown after returning the bounded response, even when work failed.
      this.stopServer();
    }
  }

  private async settleDemand(): Promise<Session | undefined> {
    try {
      return this.demand ? await bounded(this.demand, this.milliseconds) : undefined;
    } catch {
      observeHttpFailure("activation-failed");
      return undefined;
    }
  }
}
