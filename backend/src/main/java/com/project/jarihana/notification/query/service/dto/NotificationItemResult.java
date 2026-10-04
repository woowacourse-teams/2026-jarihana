package com.project.jarihana.notification.query.service.dto;

import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;

import java.time.LocalDateTime;

public record NotificationItemResult(long id, NotificationEventType eventType, int payloadVersion, String title,
                                     String body, LocalDateTime createdAt, LocalDateTime readAt, Target target) {

    public enum TargetKind { LEADER_REGISTRATIONS, MY_REGISTRATIONS }
    public record Target(TargetKind kind, long groupId, long recruitmentId) { }

    public static NotificationItemResult from(NotificationProjection projection) {
        String title = switch (projection.eventType()) {
            case REGISTRATION_SUBMITTED -> "새 신청";
            case PARTICIPANT_JOINED -> "새 참여";
            case REGISTRATION_APPROVED -> "신청 승인";
            case REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> "신청 미승인";
        };
        String body = switch (projection.eventType()) {
            case REGISTRATION_SUBMITTED -> "새로운 가입 신청이 도착했습니다.";
            case PARTICIPANT_JOINED -> "새로운 구성원이 참여했습니다.";
            case REGISTRATION_APPROVED -> "신청이 승인되었습니다.";
            case REGISTRATION_REJECTED -> "신청이 미승인되었습니다.";
            case REGISTRATION_SYSTEM_REJECTED -> switch (projection.payload().getReasonCode()) {
                case RERECRUITMENT -> "새 모집 공고가 등록되어 이전 신청이 미승인되었습니다.";
                case GROUP_ENDED -> "그룹이 종료되어 신청이 미승인되었습니다.";
            };
        };
        TargetKind kind = switch (projection.eventType()) {
            case REGISTRATION_SUBMITTED, PARTICIPANT_JOINED -> TargetKind.LEADER_REGISTRATIONS;
            case REGISTRATION_APPROVED, REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> TargetKind.MY_REGISTRATIONS;
        };
        return new NotificationItemResult(projection.id(), projection.eventType(), projection.payloadVersion(), title,
                body, projection.createdAt(), projection.readAt(),
                new Target(kind, projection.payload().getGroupId(), projection.payload().getRecruitmentId()));
    }
}
