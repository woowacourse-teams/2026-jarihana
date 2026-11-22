package com.project.jarihana.notification.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.notification.command.repository.NotificationCommandRepository;
import com.project.jarihana.notification.command.service.dto.NotificationReadAllResult;
import com.project.jarihana.notification.command.service.dto.NotificationReadResult;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class NotificationCommandService {

    private final NotificationCommandRepository notifications;
    private final NotificationDeliveryCommandRepository deliveries;
    private final Clock clock;
    private final MemberRepository members;

    @Transactional
    public NotificationReadResult readNotification(long memberId, long id) {
        requireMember(memberId);
        validateId(id);
        notifications.markRead(id, memberId, LocalDateTime.now(clock));
        Notification notification = notifications.findByIdAndMemberId(id, memberId)
                .filter(item -> item.getDeletedAt() == null).orElseThrow(NotificationCommandService::notFound);
        return new NotificationReadResult(id, notification.getReadAt());
    }

    @Transactional
    public NotificationReadAllResult readAllNotifications(long memberId) {
        requireMember(memberId);
        LocalDateTime now = LocalDateTime.now(clock);
        return new NotificationReadAllResult(notifications.markAllRead(memberId, now), now);
    }

    @Transactional
    public void deleteNotification(long memberId, long id) {
        requireMember(memberId);
        validateId(id);
        LocalDateTime now = LocalDateTime.now(clock);
        notifications.softDelete(id, memberId, now);
        notifications.findByIdAndMemberId(id, memberId).orElseThrow(NotificationCommandService::notFound);
        deliveries.cancelByNotificationId(id, now);
    }

    private void requireMember(long memberId) {
        members.findById(memberId).orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
    }

    private static void validateId(long id) {
        if (id <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "알림 식별자는 양수여야 합니다.");
        }
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND, "알림을 찾을 수 없습니다.");
    }
}
