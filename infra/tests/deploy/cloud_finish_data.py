#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["psycopg[binary]==3.3.6"]
# ///
from typing import Final

import psycopg
from psycopg import sql

LOCK_KEY: Final = 194931


def seed(database: psycopg.Connection[tuple[int, ...]]) -> None:
    _ = database.execute("""
        INSERT INTO member(crew_name,generation,github_id,member_type,course,created_at,updated_at)
        VALUES ('시험',8,'finish-fixture','CREW','BACKEND',localtimestamp,localtimestamp);
        INSERT INTO push_subscriptions(member_id,endpoint,p256dh,auth,enabled,generation,last_seen_at,created_at,updated_at)
        VALUES (1,'https://push.rehearsal.invalid/fixture','fixture','fixture',true,1,localtimestamp,localtimestamp,localtimestamp);
        INSERT INTO notifications(member_id,event_key,event_type,payload_version,payload,created_at,updated_at)
        VALUES (1,'finish-a','REGISTRATION_APPROVED',1,'{}',localtimestamp,localtimestamp),
               (1,'finish-b','REGISTRATION_APPROVED',1,'{}',localtimestamp,localtimestamp);
        INSERT INTO notification_deliveries(notification_id,push_subscription_id,subscription_generation,status,
            attempt_count,next_attempt_at,expires_at,created_at,updated_at)
        SELECT id,1,1,'PENDING',0,localtimestamp,localtimestamp + interval '1 day',localtimestamp,localtimestamp
        FROM notifications ORDER BY id;
        """)


def hold_finish(database: psycopg.Connection[tuple[int, ...]], schema: str) -> int:
    row = database.execute("SELECT oid::int FROM pg_namespace WHERE nspname = %s", (schema,)).fetchone()
    assert row is not None
    namespace = row[0]
    _ = database.execute(sql.SQL("""
        CREATE FUNCTION {}.hold_fixture_finish() RETURNS trigger LANGUAGE plpgsql AS $body$
        BEGIN
          IF NEW.status = 'ACCEPTED' AND OLD.status = 'IN_FLIGHT' THEN
            PERFORM pg_advisory_xact_lock({}, {});
          END IF;
          RETURN NEW;
        END $body$
        """).format(sql.Identifier(schema), sql.Literal(LOCK_KEY), sql.Literal(namespace)))
    _ = database.execute(sql.SQL("""
        CREATE TRIGGER fixture_finish_gate BEFORE UPDATE ON {}.notification_deliveries
        FOR EACH ROW EXECUTE FUNCTION {}.hold_fixture_finish()
        """).format(sql.Identifier(schema), sql.Identifier(schema)))
    _ = database.execute("SELECT pg_advisory_lock(%s, %s)", (LOCK_KEY, namespace))
    return namespace


def finish_is_waiting(database: psycopg.Connection[tuple[int, ...]], namespace: int) -> bool:
    row = database.execute("""
        SELECT count(*)::int FROM pg_locks
        WHERE locktype = 'advisory' AND classid = %s AND objid = %s AND objsubid = 2 AND NOT granted
        """, (LOCK_KEY, namespace)).fetchone()
    return row is not None and row[0] == 1
