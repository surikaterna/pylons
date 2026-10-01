---
"@pylons/core": patch
---

Cancel request-local provider and authorization work at their invocation deadlines
before returning the existing safe timeout failures. Preserve completed requests,
independent calls, and late-result suppression without changing other lifecycle
boundaries or public APIs.
