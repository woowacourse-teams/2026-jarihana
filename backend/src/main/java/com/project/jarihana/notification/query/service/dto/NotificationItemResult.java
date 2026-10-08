package com.project.jarihana.notification.query.service.dto;

import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;

import java.time.LocalDateTime;

public record NotificationItemResult(long id, NotificationEventType eventType, int payloadVersion, String title,
                                     String body, LocalDateTime createdAt, LocalDateTime readAt, Target target) {

    public enum TargetKind { GROUP_DETAIL, LEADER_REGISTRATIONS, LEADER_MEMBERS, MY_PAGE, MY_GROUPS }
    public record Target(TargetKind kind, long groupId, Long recruitmentId, Long registrationId) { }

    public static NotificationItemResult from(NotificationProjection projection, String groupName) {
        String title = switch (projection.eventType()) {
            case GROUP_CREATED -> "새 모임";
            case REGISTRATION_SUBMITTED -> "새 신청";
            case PARTICIPANT_JOINED -> "새 참여";
            case REGISTRATION_APPROVED -> "신청 승인";
            case REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> "신청 미승인";
        };
        String group = groupName == null ? "삭제된 모임" : "‘" + groupName + "’ 모임";
        String body = switch (projection.eventType()) {
            case GROUP_CREATED -> group + "이 새로 등록되었습니다.";
            case REGISTRATION_SUBMITTED -> group + "에 새로운 가입 신청이 도착했습니다.";
            case PARTICIPANT_JOINED -> group + "에 새로운 구성원이 참여했습니다.";
            case REGISTRATION_APPROVED -> group + "의 신청이 승인되었습니다.";
            case REGISTRATION_REJECTED -> group + "의 신청이 미승인되었습니다.";
            case REGISTRATION_SYSTEM_REJECTED -> switch (projection.payload().getReasonCode()) {
                case RERECRUITMENT -> group + "에 새 모집 공고가 등록되어 이전 신청이 미승인되었습니다.";
                case GROUP_ENDED -> group + "이 종료되어 신청이 미승인되었습니다.";
            };
        };
        TargetKind targetKind = switch (projection.eventType()) {
            case GROUP_CREATED -> TargetKind.GROUP_DETAIL;
            case REGISTRATION_SUBMITTED -> TargetKind.LEADER_REGISTRATIONS;
            case PARTICIPANT_JOINED -> TargetKind.LEADER_MEMBERS;
            case REGISTRATION_APPROVED -> TargetKind.MY_GROUPS;
            case REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> TargetKind.MY_PAGE;
        };
        return new NotificationItemResult(projection.id(), projection.eventType(), projection.payloadVersion(), title,
                body, projection.createdAt(), projection.readAt(),
                new Target(targetKind, projection.payload().getGroupId(), projection.payload().getRecruitmentId(), projection.payload().getRegistrationId()));
    }
}
