---
"@roxyon/mcp": minor
"@roxyon/api-client": minor
---

PostgreSQL databases on Roxyon hosting: `roxyon_database_create` takes `engine: mysql | postgres` (default mysql) and returns the connection details; `roxyon_list_databases` shows each database's engine. The docs now say every hosting account has PostgreSQL, so a VPS is never needed for it.
