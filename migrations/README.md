# Database Migrations

This directory contains the canonical database schema and all subsequent migrations for PearSign.

## Running Migrations

Execute the SQL files **in numerical order** against your PostgreSQL database:

```bash
psql -h <host> -U <user> -d <database> -f migrations/001_baseline.sql
```

Or, to run all migrations in sequence:

```bash
for f in migrations/*.sql; do
  echo "Applying $f ..."
  psql -h <host> -U <user> -d <database> -f "$f"
done
```

## File Conventions

| File | Purpose |
|------|---------|
| `001_baseline.sql` | Full baseline schema — all core tables and indexes |
| `002_*.sql` | First incremental change |
| `003_*.sql` | Second incremental change |
| … | Continue numbering sequentially |

## Key Points

- **`001_baseline.sql`** includes every core table the application needs. All statements use `CREATE TABLE IF NOT EXISTS` so the file is safe to re-run.
- **Future changes** should be added as new numbered files (`002_`, `003_`, …). Never edit the baseline after it has been applied to a production database.
- After applying the baseline, call **`POST /api/admin/bootstrap`** with your `ADMIN_SECRET_KEY` to seed required reference data (plans, admin user, etc.).
