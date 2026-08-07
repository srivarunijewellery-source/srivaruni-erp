# Sri Varuni ERP — one-time data migration

These files are loaded straight into Postgres by `load_sql_from_url()`,
which fetches them from this repo over HTTPS. That function is
deliberately fenced: owner only, HTTPS only, and only from this GitHub
account. **Delete it once the migration is finished** with
`select drop_sql_loader();`

Run in number order. Every file is idempotent — ids are derived from the
item code, so re-running one changes nothing.

This folder can be deleted from the repo once the load is verified.
