-- PostgreSQL delivers these invalidations on commit and folds equal payloads within a transaction.
CREATE FUNCTION jarihana_notify_space_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    old_payload TEXT;
    new_payload TEXT;
BEGIN
    CASE TG_ARGV[0]
        WHEN 'layout' THEN
            old_payload := 'layout:' || OLD.group_id;
            new_payload := 'layout:' || NEW.group_id;
        WHEN 'catalog' THEN
            new_payload := 'catalog';
        WHEN 'member' THEN
            old_payload := 'member:' || OLD.id;
            new_payload := 'member:' || NEW.id;
        WHEN 'room' THEN
            old_payload := 'room:' || OLD.id;
            new_payload := 'room:' || NEW.id;
        WHEN 'membership' THEN
            old_payload := 'membership:' || OLD.group_id || ':' || OLD.member_id;
            new_payload := 'membership:' || NEW.group_id || ':' || NEW.member_id;
    END CASE;

    IF old_payload IS NOT NULL AND old_payload IS DISTINCT FROM new_payload THEN
        PERFORM pg_notify('jarihana_space_change', old_payload);
    END IF;
    IF new_payload IS NOT NULL THEN
        PERFORM pg_notify('jarihana_space_change', new_payload);
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER notify_space_layout_lifecycle AFTER INSERT OR DELETE ON group_space
FOR EACH ROW EXECUTE FUNCTION jarihana_notify_space_change('layout');

CREATE TRIGGER notify_space_layout_update AFTER UPDATE ON group_space
FOR EACH ROW WHEN (
    (OLD.group_id, OLD.room_json, OLD.revision, OLD.blueprint_template_key, OLD.blueprint_version)
    IS DISTINCT FROM
    (NEW.group_id, NEW.room_json, NEW.revision, NEW.blueprint_template_key, NEW.blueprint_version)
) EXECUTE FUNCTION jarihana_notify_space_change('layout');

CREATE TRIGGER notify_space_furniture_lifecycle AFTER INSERT OR DELETE ON space_furniture_catalog
FOR EACH ROW EXECUTE FUNCTION jarihana_notify_space_change('catalog');

CREATE TRIGGER notify_space_furniture_update AFTER UPDATE ON space_furniture_catalog
FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION jarihana_notify_space_change('catalog');

CREATE TRIGGER notify_space_portable_item_lifecycle AFTER INSERT OR DELETE ON space_portable_item_catalog
FOR EACH ROW EXECUTE FUNCTION jarihana_notify_space_change('catalog');

CREATE TRIGGER notify_space_portable_item_update AFTER UPDATE ON space_portable_item_catalog
FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION jarihana_notify_space_change('catalog');

CREATE TRIGGER notify_space_member_delete AFTER DELETE ON member
FOR EACH ROW EXECUTE FUNCTION jarihana_notify_space_change('member');

CREATE TRIGGER notify_space_member_update AFTER UPDATE ON member
FOR EACH ROW WHEN (
    (OLD.id, OLD.withdrawn_at) IS DISTINCT FROM (NEW.id, NEW.withdrawn_at)
) EXECUTE FUNCTION jarihana_notify_space_change('member');

CREATE TRIGGER notify_space_room_delete AFTER DELETE ON groups
FOR EACH ROW EXECUTE FUNCTION jarihana_notify_space_change('room');

CREATE TRIGGER notify_space_room_update AFTER UPDATE ON groups
FOR EACH ROW WHEN (
    (OLD.id, OLD.type, OLD.status) IS DISTINCT FROM (NEW.id, NEW.type, NEW.status)
) EXECUTE FUNCTION jarihana_notify_space_change('room');

CREATE TRIGGER notify_space_membership_lifecycle AFTER INSERT OR DELETE ON group_member
FOR EACH ROW EXECUTE FUNCTION jarihana_notify_space_change('membership');

CREATE TRIGGER notify_space_membership_update AFTER UPDATE ON group_member
FOR EACH ROW WHEN (
    (OLD.group_id, OLD.member_id, OLD.role) IS DISTINCT FROM (NEW.group_id, NEW.member_id, NEW.role)
) EXECUTE FUNCTION jarihana_notify_space_change('membership');

-- Include the API-visible ordering and version fields in runtime catalog change detection.
DO $$
DECLARE
    reader RECORD;
BEGIN
    FOR reader IN
        SELECT DISTINCT grantee FROM information_schema.column_privileges
        WHERE table_schema = current_schema() AND table_name = 'space_furniture_catalog'
            AND column_name = 'definition' AND privilege_type = 'SELECT'
            AND grantee NOT IN ('PUBLIC', current_user)
    LOOP
        EXECUTE format('GRANT SELECT (display_order, min_room_version) ON space_furniture_catalog TO %I', reader.grantee);
    END LOOP;
END
$$;
