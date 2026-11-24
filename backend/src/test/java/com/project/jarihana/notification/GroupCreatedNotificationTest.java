package com.project.jarihana.notification;

import com.project.jarihana.group.command.service.GroupCommandService;
import com.project.jarihana.group.command.service.dto.CreateGroupCommand;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.GroupVisibility;
import com.project.jarihana.group.domain.MeetingType;
import com.project.jarihana.group.domain.event.GroupCreatedEvent;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class GroupCreatedNotificationTest extends NotificationIntegrationTestSupport {

    @Autowired private GroupCommandService groupService;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private ApplicationEventPublisher events;

    @Test
    @DisplayName("새 모임은 생성자를 제외한 활성 구독 회원에게 한 건씩 알리고 브라우저마다 전송한다.")
    void notifyActiveSubscribersExceptCreator() {
        // Given
        var creator = member("101");
        var recipient = member("102");
        var other = member("103");
        var disabled = member("104");
        member("105");
        subscription(creator, "creator");
        subscription(recipient, "phone");
        subscription(recipient, "desktop");
        subscription(other, "other");
        subscriptions.save(subscription(disabled, "disabled").disable(NOW));
        var withdrawn = member("106");
        subscription(withdrawn, "withdrawn");
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, withdrawn.getId());

        // When
        long groupId = groupService.createGroup(creator.getId(), command()).id();

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class))
                .containsExactlyInAnyOrder(recipient.getId(), other.getId());
        assertThat(jdbc.queryForList("select event_type from notifications", String.class)).containsOnly("GROUP_CREATED");
        assertThat(jdbc.queryForList("select event_key from notifications", String.class))
                .containsOnly("group:" + groupId + ":created");
        assertThat(jdbc.queryForList("select payload::text from notifications", String.class))
                .containsOnly("{\"groupId\": " + groupId + "}");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForList("select status from notification_deliveries", String.class)).containsOnly("PENDING");
    }

    @Test
    @DisplayName("모임 생성이 롤백되면 알림과 전송 대기도 남지 않는다.")
    void rollbackCreationLeavesNoNotifications() {
        // Given
        var creator = member("101");
        subscription(member("102"), "recipient");

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            groupService.createGroup(creator.getId(), command());
            status.setRollbackOnly();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from groups", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    @Test
    @DisplayName("크루 전용 모임을 만들면 새 모임 알림은 활성 구독이 있는 크루에게만 간다.")
    void notifyOnlyCrewSubscribersOfCrewOnlyGroup() {
        // Given
        var creator = member("101");
        var crew = member("102");
        var basic = members.save(Member.createBasic("기본", "203"));
        subscription(crew, "crew");
        subscription(basic, "basic");
        var command = new CreateGroupCommand(GroupType.CLUB, "크루 모임", "크루끼리", null,
                MeetingType.FLEXIBLE, null, null, null, null, null, GroupVisibility.CREW_ONLY);

        // When
        groupService.createGroup(creator.getId(), command);

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class))
                .containsExactly(crew.getId());
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(1);
    }

    private CreateGroupCommand command() {
        return new CreateGroupCommand(GroupType.CLUB, "새 모임", "함께해요", null,
                MeetingType.FLEXIBLE, null, null, null, null);
    }

    @Test
    @DisplayName("모임 등록 사건을 다시 처리해도 같은 회원의 알림과 전송 대기를 중복 생성하지 않는다.")
    void duplicateGroupEventCreatesOneNotification() {
        // Given
        var creator = member("101");
        var recipient = member("102");
        subscription(recipient, "recipient");
        long groupId = groupService.createGroup(creator.getId(), command()).id();

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status ->
                events.publishEvent(new GroupCreatedEvent(groupId, creator.getId(), NOW)));

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(1);
    }
}
