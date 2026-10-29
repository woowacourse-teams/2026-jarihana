package com.project.jarihana.notification.query.service.dto;

import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.query.repository.dto.ActivityPostReactionSummaryProjection;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;

import java.time.LocalDateTime;

public record NotificationItemResult(long id, NotificationEventType eventType, int payloadVersion, String title,
                                     String body, LocalDateTime createdAt, LocalDateTime readAt, Target target) {

    private static final int NAMED_REACTOR_LIMIT = 20;

    public enum TargetKind { GROUP_DETAIL, LEADER_REGISTRATIONS, LEADER_MEMBERS, MY_PAGE, MY_GROUPS, INVITATION, ACTIVITY_POST, GROUP_ANNOUNCEMENT }
    public record Target(TargetKind kind, long groupId, Long recruitmentId, Long registrationId, Long invitationId,
                         Long activityPostId, Long announcementId) { }

    /**
     * 좋아요 알림 문구는 저장하지 않고 현재 좋아요 요약으로 만든다. 다른 사건은 요약을 쓰지 않는다.
     */
    public static NotificationItemResult from(NotificationProjection projection, String groupName,
                                              ActivityPostReactionSummaryProjection reactions) {
        String title = switch (projection.eventType()) {
            case GROUP_CREATED -> "새 모임";
            case REGISTRATION_SUBMITTED -> "새 신청";
            case PARTICIPANT_JOINED -> "새 참여";
            case REGISTRATION_APPROVED -> "신청 승인";
            case REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED -> "신청 미승인";
            case INVITATION_RECEIVED -> "모임 초대";
            case ACTIVITY_POST_COMMENTED -> "새 댓글";
            case ACTIVITY_POST_REACTED -> "좋아요";
            case GROUP_ANNOUNCEMENT_CREATED -> "새 공지";
        };
        String group = groupName == null ? "삭제된 모임" : "‘" + groupName + "’ 모임";
        String body = switch (projection.eventType()) {
            case GROUP_CREATED -> group + "이 새로 등록되었습니다.";
            case REGISTRATION_SUBMITTED -> group + "에 새로운 가입 신청이 도착했습니다.";
            case PARTICIPANT_JOINED -> group + "에 새로운 구성원이 참여했습니다.";
            case REGISTRATION_APPROVED -> group + "의 신청이 승인되었습니다.";
            case INVITATION_RECEIVED -> group + "에 초대되었습니다.";
            case ACTIVITY_POST_COMMENTED -> group + " 활동 기록에 새 댓글이 달렸습니다.";
            case ACTIVITY_POST_REACTED -> reactionBody(group, reactions);
            case GROUP_ANNOUNCEMENT_CREATED -> group + "에 새 공지가 등록되었습니다.";
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
            case INVITATION_RECEIVED -> TargetKind.INVITATION;
            case ACTIVITY_POST_COMMENTED, ACTIVITY_POST_REACTED -> TargetKind.ACTIVITY_POST;
            case GROUP_ANNOUNCEMENT_CREATED -> TargetKind.GROUP_ANNOUNCEMENT;
        };
        return new NotificationItemResult(projection.id(), projection.eventType(), projection.payloadVersion(), title,
                body, projection.createdAt(), projection.readAt(),
                new Target(targetKind, projection.payload().getGroupId(), projection.payload().getRecruitmentId(),
                        projection.payload().getRegistrationId(), projection.payload().getInvitationId(),
                        projection.payload().getActivityPostId(), projection.payload().getAnnouncementId()));
    }

    private static String reactionBody(String group, ActivityPostReactionSummaryProjection reactions) {
        if (reactions == null || reactions.reactorCount() == 0) {
            return group + " 활동 기록의 좋아요가 모두 취소되었습니다.";
        }
        if (reactions.reactorCount() > NAMED_REACTOR_LIMIT) {
            return "회원님의 댓글이 무수한 관심을 받고 있어요.";
        }
        if (reactions.reactorCount() == 1) {
            return reactions.latestReactorName() + "님이 좋아요를 눌렀어요.";
        }
        return reactions.latestReactorName() + " 외 " + (reactions.reactorCount() - 1) + "명이 좋아요를 눌렀어요.";
    }
}
