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
    @DisplayName("초대 알림은 모집·신청 ID 없이 생성하며 사건 종류와 다른 식별자나 섞인 데이터를 거부한다.")
    void validateRequiredIdentifiersForEachEventWithoutVersionSplit() {
        // Given
        Member member = Member.create("우주", 8, "123", Course.BACKEND);
        NotificationPayload invitation = NotificationPayload.invitation(1, 501);

        // When
        Notification notification = Notification.create(member, "invitation:501:received",
                NotificationEventType.INVITATION_RECEIVED, invitation, NOW);

        // Then
        assertThat(notification.getPayloadVersion()).isEqualTo(1);
        assertThat(invitation.getRecruitmentId()).isNull();
        assertThat(invitation.getRegistrationId()).isNull();
        assertThat(invitation.getInvitationId()).isEqualTo(501);
        assertThatThrownBy(() -> Notification.create(member, "invalid", NotificationEventType.REGISTRATION_APPROVED,
                invitation, NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Notification.create(member, "invalid", NotificationEventType.INVITATION_RECEIVED,
                NotificationPayload.of(1, 2, 3, null), NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.from(1, 2L, 3L, 501L, null, null, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.from(1, null, null, 501L, null, null, SystemRejectionReason.GROUP_ENDED))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.from(1, 2L, null, null, null, null, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Notification.create(member, "invalid", NotificationEventType.INVITATION_RECEIVED,
                NotificationPayload.forGroup(1), NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Notification.create(member, "invalid", NotificationEventType.GROUP_CREATED,
                invitation, NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.invitation(1, 0)).isInstanceOf(BusinessException.class);
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
        assertThatThrownBy(() -> NotificationPayload.from(1, 2L, null, null, null, null, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.forGroup(0)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("활동 기록 댓글과 좋아요 알림은 모임과 활동 기록 식별자만 저장하고 다른 사건의 식별자와 섞지 않는다.")
    void activityPostCommentPayloadContainsGroupAndPost() {
        // Given
        Member member = Member.create("우주", 8, "123", Course.BACKEND);
        NotificationPayload activityPost = NotificationPayload.activityPost(1, 77);

        // When
        Notification created = Notification.create(member, "activity-post-comment:9:created",
                NotificationEventType.ACTIVITY_POST_COMMENTED, activityPost, NOW);

        // Then
        assertThat(created.getPayload().getGroupId()).isEqualTo(1);
        assertThat(created.getPayload().getActivityPostId()).isEqualTo(77);
        assertThat(created.getPayload().getRecruitmentId()).isNull();
        assertThat(created.getPayload().getRegistrationId()).isNull();
        assertThat(created.getPayload().getInvitationId()).isNull();
        assertThatThrownBy(() -> Notification.create(member, "group:1:created", NotificationEventType.GROUP_CREATED,
                activityPost, NOW)).isInstanceOf(BusinessException.class);
        assertThat(Notification.create(member, "activity-post-reaction:5:created",
                NotificationEventType.ACTIVITY_POST_REACTED, activityPost, NOW).getPayload()).isEqualTo(activityPost);
        assertThatThrownBy(() -> Notification.create(member, "invalid", NotificationEventType.ACTIVITY_POST_COMMENTED,
                NotificationPayload.forGroup(1), NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Notification.create(member, "invalid", NotificationEventType.ACTIVITY_POST_REACTED,
                NotificationPayload.invitation(1, 501), NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> Notification.create(member, "invalid", NotificationEventType.ACTIVITY_POST_COMMENTED,
                NotificationPayload.of(1, 2, 3, null), NOW)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.from(1, 2L, 3L, null, 77L, null, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.from(1, null, null, 501L, 77L, null, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationPayload.activityPost(1, 0)).isInstanceOf(BusinessException.class);
    }
}
