---
"@roxyon/api-client": patch
---

fix: don't send X-BEA-Application-ID on authenticated requests — /Auth/login and /Auth/me were silently returning anon tokens, so roxyon login always failed
