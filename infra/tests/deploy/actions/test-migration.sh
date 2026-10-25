#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
source "$ROOT/infra/scripts/deploy/migration-review.sh"
for sql in 'ALTER TABLE member DROP COLUMN name;' 'alter table member rename name to display_name;' \
  $'ALTER TABLE t ALTER\n COLUMN x TYPE bigint;' 'TRUNCATE member;' 'UPDATE member SET name=display_name;' \
  '-- DROP postponed' 'ALTER TABLE t ADD COLUMN x integer NOT NULL;' 'DELETE FROM member;' \
  'ALTER TABLE t ADD CONSTRAINT fk FOREIGN KEY (x) REFERENCES m(id);' 'CREATE UNIQUE INDEX ix ON t(x);'; do
  migration_requires_review <<< "$sql" || { printf 'Missed risky SQL\n' >&2; exit 1; }
done
if migration_requires_review <<< 'ALTER TABLE member ADD COLUMN display_name varchar(255);'; then exit 1; fi
if migration_requires_review <<< 'SELECT updated_at, dropped_value FROM member;'; then exit 1; fi
printf 'MIGRATION_HINT_TESTS_PASSED=12\n'
