import type { InvocationContext } from "@pylons/contracts";
import type { InvocationAuthority } from "@pylons/core";
import { type Tenant, tenant } from "./domain.js";
import { Signal } from "./lifetime.js";

export interface Credential {
  readonly tenant: Tenant;
  readonly subject: string;
  readonly reference: string;
}
export function authenticate(token: unknown): Credential | undefined {
  if (typeof token !== "string" || !/^[ab]-(alice|bob)$/.test(token)) return undefined;
  const scope = token.slice(0, 1);
  if (!tenant(scope)) return undefined;
  const subject = token;
  return Object.freeze({ tenant: scope, subject, reference: `credential:${subject}` });
}
export class SecurityPolicy implements InvocationAuthority {
  private initialized = false;
  private sequence = 0;
  get ready(): boolean {
    return this.initialized;
  }
  initialize(success: boolean): boolean {
    this.initialized = success && authenticate("a-alice") !== undefined && authenticate("b-bob") !== undefined;
    return this.initialized;
  }
  async authorize(request: Parameters<InvocationAuthority["authorize"]>[0]): ReturnType<InvocationAuthority["authorize"]> {
    const credential = authenticate(request.invocation.principal.subjectId);
    const allowed =
      this.initialized &&
      credential?.tenant === request.verifiedContext.scope.tenantId &&
      credential.reference === request.invocation.credential.reference &&
      request.invocation.transaction.id.startsWith("call-");
    return allowed ? { kind: "allow" } : { kind: "deny" };
  }
  request(credential: Credential, cancellation = new Signal()): InvocationContext {
    return Object.freeze({
      principal: { subjectId: credential.subject },
      credential: { reference: credential.reference },
      transaction: { id: `call-${++this.sequence}` },
      cancellation,
    });
  }
}
