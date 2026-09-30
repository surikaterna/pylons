import debug from "debug";
import { activate } from "../../tests/feasibility/activation.js";
import { bunLoader } from "../../tests/feasibility/loader-bun.js";
import { bindLogging } from "../../tests/feasibility/logging-bootstrap.js";
import { requestContext } from "../../tests/feasibility/request-context.js";
import { isObject } from "../../tests/feasibility/artifact-index.js";

debug.enable("pylons:*");
bindLogging();
const origin = process.argv[2];
const title = process.argv[3];
try {
  if (!origin || title === undefined) throw new Error("arguments-invalid");
  const session = await activate(origin, "cli", bunLoader(origin));
  try {
    const first = await session.invoke({ title }, requestContext("cli-first"));
    const second = await session.invoke({ title }, requestContext("cli-second"));
    console.log(JSON.stringify({ host: "cli", first, second, counts: session.counts() }));
    if (!first.success) process.exitCode = 2;
    else if (isObject(first.data) && first.data.valid === false) process.exitCode = 1;
  } finally { await session.stop(); }
} catch {
  console.error("infrastructure-failed");
  process.exitCode = 2;
}
