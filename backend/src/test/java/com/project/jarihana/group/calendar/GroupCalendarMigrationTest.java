package com.project.jarihana.group.calendar;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.ResultSet;

import static org.assertj.core.api.Assertions.assertThat;

class GroupCalendarMigrationTest {

    @DisplayName("기존 PostgreSQL 그룹 행에 확장 SQL과 배치 백필을 재실행해도 중복 이력이 생기지 않는다.")
    @Test
    void expandsAndBackfillsLegacyGroupsIdempotently() throws Exception {
        // Given
        String url = "jdbc:tc:postgresql:17:///group_calendar_migration_test";
        try (var connection = DriverManager.getConnection(url); var statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE groups (
                        id BIGINT PRIMARY KEY,
                        location VARCHAR(255),
                        recurring_activity_days VARCHAR(255),
                        recurring_start_time TIME,
                        recurring_end_time TIME,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL
                    )
                    """);
            statement.execute("""
                    INSERT INTO groups VALUES
                    (1, '기존 장소', 'MONDAY,WEDNESDAY', '19:00', '21:00',
                     '2026-01-10 10:00:00', '2026-08-19 10:00:00'),
                    (2, NULL, NULL, NULL, NULL,
                     '2026-02-01 12:00:00', '2026-08-19 10:00:00')
                    """);
            statement.execute("""
                    CREATE TABLE group_event (
                        id BIGSERIAL PRIMARY KEY,
                        group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
                        title VARCHAR(50) NOT NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NOT NULL,
                        all_day BOOLEAN NOT NULL,
                        start_time TIME WITHOUT TIME ZONE,
                        end_time TIME WITHOUT TIME ZONE,
                        description VARCHAR(10000) NOT NULL,
                        location VARCHAR(255),
                        deleted_at TIMESTAMP WITHOUT TIME ZONE,
                        version BIGINT NOT NULL DEFAULT 0,
                        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
                    )
                    """);
            statement.execute("""
                    INSERT INTO group_event (group_id, title, start_date, end_date, all_day,
                        description, version, created_at, updated_at)
                    VALUES (1, '기존 일정', '2026-08-20', '2026-08-20', TRUE,
                        '보존할 일정', 0, '2026-08-19 10:00:00', '2026-08-19 10:00:00')
                    """);

            String expand = Files.readString(Path.of("db/migrations/2026-10-07-group-calendar-expand.sql"));
            String backfill = Files.readString(Path.of("db/migrations/2026-10-07-group-calendar-backfill-batch.sql"))
                    .replace("BATCH_START_ID", "1").replace("BATCH_END_ID", "100");

            // When
            statement.execute(expand);
            statement.execute(expand);
            statement.execute(backfill);
            statement.execute(backfill);

            // Then
            assertThat(count(statement.executeQuery("SELECT COUNT(*) FROM group_location_history"))).isEqualTo(2);
            assertThat(count(statement.executeQuery("SELECT COUNT(*) FROM group_recurring_series"))).isEqualTo(1);
            assertThat(count(statement.executeQuery("SELECT COUNT(*) FROM group_recurring_schedule_period")))
                    .isEqualTo(1);
            try (ResultSet events = statement.executeQuery("SELECT event_type, event_status, title FROM group_event WHERE id = 1")) {
                assertThat(events.next()).isTrue();
                assertThat(events.getString(1)).isEqualTo("INDIVIDUAL");
                assertThat(events.getString(2)).isEqualTo("AUTO");
                assertThat(events.getString(3)).isEqualTo("기존 일정");
            }
            try (ResultSet rows = statement.executeQuery("""
                    SELECT g.recurring_activity_days, g.location, g.show_base_schedule_in_calendar,
                           s.calendar_start_date, p.days_of_week
                    FROM groups g
                    JOIN group_recurring_series s ON s.group_id = g.id
                    JOIN group_recurring_schedule_period p ON p.series_id = s.id
                    WHERE g.id = 1
                    """)) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("MONDAY,WEDNESDAY");
                assertThat(rows.getString(2)).isEqualTo("기존 장소");
                assertThat(rows.getBoolean(3)).isTrue();
                assertThat(rows.getDate(4).toLocalDate().toString()).isEqualTo("2026-01-10");
                assertThat(rows.getString(5)).isEqualTo("MONDAY,WEDNESDAY");
            }
        }
    }

    private long count(ResultSet rows) throws Exception {
        try (rows) {
            assertThat(rows.next()).isTrue();
            return rows.getLong(1);
        }
    }
}
