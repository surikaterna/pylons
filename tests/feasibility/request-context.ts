import type { InvocationContext } from "@pylons/contracts";
import { cancellation } from "./metadata.js";

export function requestContext(id: string): InvocationContext {
  return { principal: { subjectId: "local-principal" }, credential: { reference: "local-credential-reference" }, transaction: { id }, cancellation };
}
