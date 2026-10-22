# Security and data boundary

Use fictional accounts and documents for candidate acceptance. Keep database, administrator, service, session and Agent credentials outside Git. The installer stores them under `.private-install/`, with owner-only access. Do not attach unreviewed environment files, screenshots, traces, database backups, or raw logs to public reports.

`/workspace` and `/api/v1/` authorize workspace membership and assigned Agent scope. Native NocoBase administration, its API, PostgreSQL, raw uploaded files and legacy application APIs must not be exposed as public alternatives. The current installation recipe binds web and backend to loopback and has no database host port. It is not a production HTTPS recipe.

An operating public service requires a verified private vulnerability reporting channel and a tested backup/recovery procedure. Neither is established by this document. Until a channel is verified, do not publish sensitive exploit details or confidential data in issues.

Agent keys can be revoked by the workspace owner. Do not rotate server pepper or session keys casually: preservation and recovery of these secrets must be planned with the database and uploaded files.
