# @roxyon/api-client

## 0.1.1

### Patch Changes

- 89f9eec: fix: don't send X-BEA-Application-ID on authenticated requests — /Auth/login and /Auth/me were silently returning anon tokens, so roxyon login always failed
