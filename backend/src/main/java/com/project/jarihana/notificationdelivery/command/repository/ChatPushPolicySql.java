package com.project.jarihana.notificationdelivery.command.repository;

final class ChatPushPolicySql {
    private ChatPushPolicySql() {}

    // Existing notifications already carry this immutable message identity in their event key.
    // Validate the range before casting so an unrecognized legacy key cannot stop a worker batch.
    static final String SOURCE_JOIN = """
            left join chat_message message on n.event_type = 'CHAT_MESSAGE_RECEIVED'
                and message.id = cast(case
                    when substring(n.event_key from '^chat-message:([0-9]{1,19}):created$')::numeric
                        between 1 and 9223372036854775807
                    then substring(n.event_key from '^chat-message:([0-9]{1,19}):created$') end as bigint)
                and message.group_id::text = n.payload ->> 'groupId'
            left join chat_read_state read_state on read_state.group_id = message.group_id
                and read_state.member_id = n.member_id
            left join member_activity activity on activity.member_id = n.member_id
            """;

    static final String STALE_TARGET = """
            n.deleted_at is not null or not s.enabled or d.subscription_generation <> s.generation
            or n.member_id <> s.member_id
            or (n.event_type = 'GROUP_ANNOUNCEMENT_CREATED' and s.client_version < 2)
            or (n.event_type = 'CHAT_MESSAGE_RECEIVED' and (s.client_version < 3 or message.id is null))
            """;

    static final String READ = "read_state.last_read_sequence >= message.sequence";
    static final String ACTIVE = """
            n.event_type = 'CHAT_MESSAGE_RECEIVED'
            and activity.last_active_at > cast(:now as timestamp) - interval '15 seconds'
            """;

    static final String NEWER_REPRESENTATIVE = """
            exists (
                select 1 from notifications newer
                join notification_deliveries other on other.notification_id = newer.id
                join chat_message newer_message on newer_message.id = cast(case
                    when substring(newer.event_key from '^chat-message:([0-9]{1,19}):created$')::numeric
                        between 1 and 9223372036854775807
                    then substring(newer.event_key from '^chat-message:([0-9]{1,19}):created$') end as bigint)
                where newer.event_type = 'CHAT_MESSAGE_RECEIVED' and newer.member_id = n.member_id
                    and newer.payload ->> 'groupId' = n.payload ->> 'groupId'
                    and newer.deleted_at is null
                    and newer_message.group_id = message.group_id and newer_message.sequence > message.sequence
                    and other.push_subscription_id = d.push_subscription_id
                    and other.subscription_generation = d.subscription_generation
                    and (other.status = 'ACCEPTED' or (
                        other.status in ('PENDING', 'RETRY', 'IN_FLIGHT') and other.expires_at > :now
                        and (other.attempt_count < 5 or (other.status = 'IN_FLIGHT' and other.locked_until > :now))))
            )
            """;

    static final String ROOM_IN_FLIGHT = """
            exists (
                select 1 from notification_deliveries other
                join notifications in_flight on in_flight.id = other.notification_id
                where other.push_subscription_id = d.push_subscription_id
                    and other.subscription_generation = d.subscription_generation and other.id <> d.id
                    and other.status = 'IN_FLIGHT' and other.locked_until > :now
                    and in_flight.event_type = 'CHAT_MESSAGE_RECEIVED' and in_flight.member_id = n.member_id
                    and in_flight.payload ->> 'groupId' = n.payload ->> 'groupId'
            )
            """;
}
