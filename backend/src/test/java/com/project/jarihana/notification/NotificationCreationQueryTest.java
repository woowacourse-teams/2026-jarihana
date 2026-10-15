package com.project.jarihana.notification;

import com.project.jarihana.group.command.service.GroupCommandService;
import com.project.jarihana.group.command.service.dto.CreateGroupCommand;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.MeetingType;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import org.hibernate.cfg.AvailableSettings;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

@Import(NotificationCreationQueryTest.SqlCaptureConfiguration.class)
class NotificationCreationQueryTest extends NotificationIntegrationTestSupport {

    private static final Pattern NOTIFICATION_SELECT = Pattern.compile(
            "(?is)^\\s*(?:/\\*.*?\\*/\\s*)?select\\b.*\\b(?:from|join)\\s+notifications\\b");
    private static final Pattern NOTIFICATION_INSERT = Pattern.compile(
            "(?is)\\binsert\\s+into\\s+notifications\\b");
    private static final Pattern DELIVERY_INSERT = Pattern.compile(
            "(?is)\\binsert\\s+into\\s+notification_deliveries\\b");

    @Autowired private GroupCommandService groupService;
    @Autowired private RecordingInspector inspector;

    @ParameterizedTest
    @ValueSource(ints = {1, 49, 50, 51, 200})
    @DisplayName("모임 알림과 브라우저별 전송 대기를 50건씩 저장하고 알림을 다시 조회하지 않는다.")
    void createNotificationsAndDeliveriesInBatchesWithoutReloadingNotifications(int recipients) {
        // Given
        var creator = member("101");
        for (int index = 0; index < recipients; index++) {
            var recipient = member(Integer.toString(102 + index));
            subscription(recipient, "phone-" + index);
            if (index == 0) {
                subscription(recipient, "desktop-" + index);
            }
        }
        var command = new CreateGroupCommand(GroupType.CLUB, "새 모임", "함께해요", null,
                MeetingType.FLEXIBLE, null, null, null, null);

        // When
        List<String> statements = inspector.capture(() -> groupService.createGroup(creator.getId(), command));

        // Then
        assertThat(statements.stream().filter(sql -> NOTIFICATION_INSERT.matcher(sql).find()).count())
                .isEqualTo((recipients + 49) / 50);
        assertThat(statements.stream().filter(sql -> DELIVERY_INSERT.matcher(sql).find()).count())
                .isEqualTo((recipients + 1 + 49) / 50);
        assertThat(statements).noneMatch(sql -> NOTIFICATION_SELECT.matcher(sql).find());
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(recipients);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isEqualTo(recipients + 1);
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_deliveries d
                join notifications n on n.id = d.notification_id
                join push_subscriptions s on s.id = d.push_subscription_id
                where n.member_id = s.member_id and d.subscription_generation = s.generation
                    and d.status = 'PENDING' and d.attempt_count = 0
                """, Long.class)).isEqualTo(recipients + 1);
    }

    @Test
    @DisplayName("브라우저가 하나씩인 수신자 200명의 알림과 전송 대기 400행을 INSERT 8회로 저장한다.")
    void storeTwoHundredNotificationsAndDeliveriesWithEightInserts() {
        // Given
        var creator = member("101");
        for (int index = 0; index < 200; index++) {
            subscription(member(Integer.toString(102 + index)), "phone-" + index);
        }
        var command = new CreateGroupCommand(GroupType.CLUB, "새 모임", "함께해요", null,
                MeetingType.FLEXIBLE, null, null, null, null);

        // When
        List<String> statements = inspector.capture(() -> groupService.createGroup(creator.getId(), command));

        // Then
        assertThat(statements.stream().filter(sql -> NOTIFICATION_INSERT.matcher(sql).find()).count()).isEqualTo(4);
        assertThat(statements.stream().filter(sql -> DELIVERY_INSERT.matcher(sql).find()).count()).isEqualTo(4);
        assertThat(statements).noneMatch(sql -> NOTIFICATION_SELECT.matcher(sql).find());
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isEqualTo(200);
    }

    @Test
    @DisplayName("한 수신자의 브라우저가 51개면 알림은 한 번, 전송 대기는 두 번의 INSERT로 저장한다.")
    void splitFiftyOneBrowserDeliveriesIndependentlyOfNotificationBatch() {
        // Given
        var creator = member("101");
        var recipient = member("102");
        for (int index = 0; index < 51; index++) {
            subscription(recipient, "browser-" + index);
        }
        var command = new CreateGroupCommand(GroupType.CLUB, "새 모임", "함께해요", null,
                MeetingType.FLEXIBLE, null, null, null, null);

        // When
        List<String> statements = inspector.capture(() -> groupService.createGroup(creator.getId(), command));

        // Then
        assertThat(statements.stream().filter(sql -> NOTIFICATION_INSERT.matcher(sql).find()).count()).isEqualTo(1);
        assertThat(statements.stream().filter(sql -> DELIVERY_INSERT.matcher(sql).find()).count()).isEqualTo(2);
        assertThat(statements).noneMatch(sql -> NOTIFICATION_SELECT.matcher(sql).find());
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isEqualTo(51);
    }

    @Test
    @DisplayName("알림 수신자가 없으면 알림과 전송 대기 INSERT를 실행하지 않는다.")
    void skipNotificationAndDeliveryInsertsWithoutRecipients() {
        // Given
        var creator = member("101");
        var command = new CreateGroupCommand(GroupType.CLUB, "새 모임", "함께해요", null,
                MeetingType.FLEXIBLE, null, null, null, null);

        // When
        List<String> statements = inspector.capture(() -> groupService.createGroup(creator.getId(), command));

        // Then
        assertThat(statements).noneMatch(sql -> NOTIFICATION_INSERT.matcher(sql).find());
        assertThat(statements).noneMatch(sql -> DELIVERY_INSERT.matcher(sql).find());
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SqlCaptureConfiguration {

        @Bean
        RecordingInspector notificationSqlInspector() {
            return new RecordingInspector();
        }

        @Bean
        HibernatePropertiesCustomizer captureNotificationSql(RecordingInspector inspector) {
            return properties -> properties.put(AvailableSettings.STATEMENT_INSPECTOR, inspector);
        }
    }

    static class RecordingInspector implements StatementInspector {

        private final ThreadLocal<List<String>> recording = new ThreadLocal<>();

        List<String> capture(Runnable action) {
            List<String> statements = new ArrayList<>();
            recording.set(statements);
            try {
                action.run();
                return List.copyOf(statements);
            } finally {
                recording.remove();
            }
        }

        @Override
        public String inspect(String sql) {
            List<String> statements = recording.get();
            if (statements != null) {
                statements.add(sql);
            }
            return sql;
        }
    }
}
