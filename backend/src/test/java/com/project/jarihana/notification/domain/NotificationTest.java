package com.project.jarihana.notification.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 10, 0);

    @Test
    @DisplayName("새 알림은 읽음과 삭제 시각 없이 필요한 업무 식별자만 가진다.")
    void createUnreadNotification() {
        // Given
        Member member = Member.create("우주", 8, "123", Course.BACKEND);
        NotificationPayload payload = NotificationPayload.of(1, 2, 3, null);

        // When
        Notification notification = Notification.create(member, "registration:3:approved",
                NotificationEventType.REGISTRATION_APPROVED, payload, NOW);

        // Then
        assertThat(notification.getMember()).isSameAs(member);
        assertThat(notification.getPayload()).isEqualTo(payload);
        assertThat(notification.getPayloadVersion()).isEqualTo(1);
        assertThat(notification.getReadAt()).isNull();
        assertThat(notification.getDeletedAt()).isNull();
        assertThat(notification.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("읽음과 삭제는 원본을 변경하지 않으며 최초 시각을 유지한다.")
    void readAndDeleteImmutablyAndIdempotently() {
        // Given
        Notification original = notification();

        // When
        Notification read = original.markRead(NOW.plusMinutes(1));
        Notification deleted = read.delete(NOW.plusMinutes(2));

        // Then
        assertThat(original.getReadAt()).isNull();
        assertThat(original.getDeletedAt()).isNull();
        assertThat(deleted.getReadAt()).isEqualTo(NOW.plusMinutes(1));
        assertThat(deleted.getDeletedAt()).isEqualTo(NOW.plusMinutes(2));
        assertThat(read.markRead(NOW.plusMinutes(3))).isSameAs(read);
        assertThat(deleted.delete(NOW.plusMinutes(3))).isSameAs(deleted);
        assertThat(deleted.markRead(NOW.plusMinutes(3))).isSameAs(deleted);
        assertThat(deleted.getEventKey()).isEqualTo(original.getEventKey());
        assertThat(deleted.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("시스템 미승인에만 원인 분류를 필수로 저장한다.")
    void validateSystemRejectionReason() {
        // Given
        Member member = Member.create("우주", 8, "123", Course.BACKEND);

        // When & Then
        assertThatThrownBy(() -> Notification.create(member, "registration:3:system-rejected",
                NotificationEventType.REGISTRATION_SYSTEM_REJECTED,
                NotificationPayload.of(1, 2, 3, null), NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Notification.create(member, "registration:3:approved",
                NotificationEventType.REGISTRATION_APPROVED,
                NotificationPayload.of(1, 2, 3, SystemRejectionReason.GROUP_ENDED), NOW))
                .isInstanceOf(BusinessException.class);
        assertThat(Notification.create(member, "registration:3:system-rejected",
                NotificationEventType.REGISTRATION_SYSTEM_REJECTED,
                NotificationPayload.of(1, 2, 3, SystemRejectionReason.RERECRUITMENT), NOW)
                .getPayload().getReasonCode()).isEqualTo(SystemRejectionReason.RERECRUITMENT);
    }

    @Test
    @DisplayName("비어 있거나 너무 긴 사건 의미키와 잘못된 업무 식별자를 거절한다.")
    void rejectInvalidEventKeyAndPayload() {
        // Given
        Member member = Member.create("우주", 8, "123", Course.BACKEND);

        // When & Then
        assertThatThrownBy(() -> NotificationPayload.of(0, 2, 3, null))
                .isInstanceOf(BusinessException.class);
        for (String eventKey : new String[]{"", " ", "a".repeat(161)}) {
            assertThatThrownBy(() -> Notification.create(member, eventKey,
                    NotificationEventType.REGISTRATION_APPROVED,
                    NotificationPayload.of(1, 2, 3, null), NOW)).isInstanceOf(BusinessException.class);
        }
        assertThat(notification()).isNotEqualTo(notification());
    }

    private Notification notification() {
        return Notification.create(Member.create("우주", 8, "123", Course.BACKEND),
                "registration:3:approved", NotificationEventType.REGISTRATION_APPROVED,
                NotificationPayload.of(1, 2, 3, null), NOW);
    }

    @Test
    @DisplayName("모임 등록 알림만 모집과 신청 없이 모임 식별자만 저장한다.")
    void groupCreatedPayloadContainsOnlyGroup() {
        // Given
        Member member = Member.create("우주", 8, "123", Course.BACKEND);
        NotificationPayload group = NotificationPayload.forGroup(1);

        // When
        Notification created = Notification.create(member, "group:1:created", NotificationEventType.GROUP_CREATED, group, NOW);

        // Then
        assertThat(created.getPayload().getGroupId()).isEqualTo(1);
        assertThat(created.getPayload().getRegistrationId()).isNull();
        assertThatThrownBy(() -> Notification.create(member, "registration:1:approved",
                NotificationEventType.REGISTRATION_APPROVED, group, NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Notification.create(member, "group:1:created", NotificationEventType.GROUP_CREATED,
                NotificationPayload.of(1, 2, 3, null), NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.from(1, 2L, null, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.forGroup(0)).isInstanceOf(BusinessException.class);
    }
}
