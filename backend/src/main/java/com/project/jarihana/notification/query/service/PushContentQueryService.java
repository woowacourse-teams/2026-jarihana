package com.project.jarihana.notification.query.service;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.notification.query.repository.NotificationQueryRepository;
import com.project.jarihana.notification.query.service.dto.PushContentQuery;
import com.project.jarihana.notification.query.service.dto.PushContentResult;
import com.project.jarihana.pushsubscription.query.repository.PushSubscriptionQueryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PushContentQueryService {
    private final NotificationQueryRepository notifications;
    private final PushSubscriptionQueryRepository subscriptions;
    private final MemberRepository members;

    public PushContentResult findPushContent(long memberId, long id, PushContentQuery query) {
        members.findById(memberId).orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
        if (id <= 0 || query.subscriptionId() <= 0 || query.generation() <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "알림·구독 식별자와 연결 버전은 양수여야 합니다.");
        }
        subscriptions.findActive(query.subscriptionId(), memberId, query.generation()).orElseThrow(PushContentQueryService::notFound);
        var notification = notifications.findActiveByIdAndMemberId(id, memberId).orElseThrow(PushContentQueryService::notFound);
        return new PushContentResult(notification.id(), notification.eventType(), notification.payloadVersion(), notification.payload());
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND, "알림을 찾을 수 없습니다.");
    }
}
