---
"@roxyon/mcp": minor
"@roxyon/api-client": minor
---

Redis on hosting: `roxyon_database_create` takes `engine: "redis"` (one per account, 127.0.0.1:6379, password-protected). The server instructions now list what every hosting account includes (MySQL, PostgreSQL, Redis, mail, domains + SSL, apps, SSH) and tell agents never to send users to a VPS or an outside service for them.
