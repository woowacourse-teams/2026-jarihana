-- Install only in the disposable NOTIFY benchmark database, after Flyway.
CREATE FUNCTION sparring_benchmark_notify_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('sparring_benchmark_revision', NEW.id || ':' || NEW.revision);
    RETURN NEW;
END;
$$;

CREATE TRIGGER sparring_benchmark_notify_revision
AFTER UPDATE OF revision ON sparring_topic
FOR EACH ROW WHEN (OLD.revision IS DISTINCT FROM NEW.revision)
EXECUTE FUNCTION sparring_benchmark_notify_revision();
