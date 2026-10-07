package com.project.jarihana.notificationdelivery.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationDeliveryTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 10, 0);
    private static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(HexFormat.of().parseHex(
            "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"
                    + "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"));
    private static final String AUTH = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);

    @Test
    @DisplayName("전송 대기는 생성 시 연결 버전을 복사하고 구독이 바뀌어도 유지한다.")
    void pendingDeliveryKeepsGenerationSnapshot() {
        // Given
        Member member = member("123");
        PushSubscription subscription = PushSubscription.create(member, "https://fcm.googleapis.com/x", KEY, AUTH, NOW);

        // When
        NotificationDelivery delivery = NotificationDelivery.create(notification(member), subscription, NOW, NOW.plusHours(24));
        PushSubscription reconnected = subscription.disable(NOW).reconnect(KEY, AUTH, NOW.plusMinutes(1));

        // Then
        assertThat(delivery.getStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(delivery.getAttemptCount()).isZero();
        assertThat(delivery.getNextAttemptAt()).isEqualTo(NOW);
        assertThat(delivery.getExpiresAt()).isEqualTo(NOW.plusHours(24));
        assertThat(delivery.getSubscriptionGeneration()).isEqualTo(1);
        assertThat(reconnected.getGeneration()).isEqualTo(3);
        assertThat(delivery.getLeaseToken()).isNull();
        assertThat(delivery.getLockedUntil()).isNull();
        assertThat(delivery.getAcceptedAt()).isNull();
    }

    @Test
    @DisplayName("취소는 원본을 변경하지 않고 반복 취소에 같은 상태를 유지한다.")
    void cancelImmutably() {
        // Given
        Member member = member("123");
        NotificationDelivery original = NotificationDelivery.create(notification(member),
                PushSubscription.create(member, "https://fcm.googleapis.com/x", KEY, AUTH, NOW), NOW, NOW.plusHours(24));

        // When
        NotificationDelivery cancelled = original.cancel();

        // Then
        assertThat(original.getStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(cancelled.getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(cancelled.cancel()).isSameAs(cancelled);
        assertThat(cancelled.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("다른 회원이나 비활성 구독 또는 유효하지 않은 기한에 전송 대기를 만들지 않는다.")
    void rejectInvalidDeliveryTarget() {
        // Given
        Member member = member("123");
        Notification notification = notification(member);
        PushSubscription subscription = PushSubscription.create(member, "https://fcm.googleapis.com/x", KEY, AUTH, NOW);

        // When & Then
        assertThatThrownBy(() -> NotificationDelivery.create(notification, subscription.disable(NOW), NOW, NOW.plusHours(24)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationDelivery.create(notification,
                PushSubscription.create(member("456"), "https://fcm.googleapis.com/y", KEY, AUTH, NOW), NOW, NOW.plusHours(24)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationDelivery.create(notification, subscription, NOW, NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> NotificationDelivery.create(notification.delete(NOW), subscription, NOW, NOW.plusHours(24)))
                .isInstanceOf(BusinessException.class);
    }

    private Member member(String githubId) {
        return Member.create("우주", 8, githubId, Course.BACKEND);
    }

    private Notification notification(Member member) {
        return Notification.create(member, "registration:3:approved", NotificationEventType.REGISTRATION_APPROVED,
                NotificationPayload.of(1, 2, 3, null), NOW);
    }
}
