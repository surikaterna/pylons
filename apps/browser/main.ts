import debug from "debug";
import { activate } from "../../tests/feasibility/activation.js";
import { browserLoader } from "../../tests/feasibility/loader-browser.js";
import { bindLogging } from "../../tests/feasibility/logging-bootstrap.js";
import { requestContext } from "../../tests/feasibility/request-context.js";

debug.enable("pylons:*");
bindLogging();
async function run() {
  const origin = location.origin;
  const session = await activate(origin, "browser", browserLoader(origin));
  try {
    const first = await session.invoke({ title: "four" }, requestContext("browser-first"));
    const second = await session.invoke({ title: "" }, requestContext("browser-second"));
    return { host: "browser", first, second, counts: session.counts() };
  } finally { await session.stop(); }
}
run().then((result) => {
  const target = document.getElementById("result");
  if (target) target.textContent = JSON.stringify(result);
}).catch(() => {
  const target = document.getElementById("result");
  if (target) target.textContent = "infrastructure-failed";
});
