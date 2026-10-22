package com.project.jarihana.notification.query.controller.dto;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.query.repository.dto.ActivityPostReactionSummaryProjection;
import com.project.jarihana.notification.query.service.dto.PushContentResult;
import com.fasterxml.jackson.annotation.JsonInclude;
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PushContentResponse(long notificationId, String eventType, int payloadVersion, PayloadResponse payload,
                                  ReactionSummaryResponse reactionSummary) {
    public static PushContentResponse from(PushContentResult result) {
        return new PushContentResponse(result.notificationId(), result.eventType().name(), result.payloadVersion(), PayloadResponse.from(result.payload()),
                ReactionSummaryResponse.from(result.reactionSummary()));
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PayloadResponse(long groupId, Long recruitmentId, Long registrationId, Long invitationId, Long activityPostId,
                                  String reasonCode) {
        static PayloadResponse from(NotificationPayload payload) {
            return new PayloadResponse(payload.getGroupId(), payload.getRecruitmentId(), payload.getRegistrationId(), payload.getInvitationId(),
                    payload.getActivityPostId(), payload.getReasonCode() == null ? null : payload.getReasonCode().name());
        }
    }

    /**
     * 좋아요 알림 푸시 문구에 쓰는 가장 최근에 누른 회원 이름과 나머지 인원이다. 좋아요가 없으면 넣지 않는다.
     */
    public record ReactionSummaryResponse(String latestReactorName, long otherReactorCount) {
        static ReactionSummaryResponse from(ActivityPostReactionSummaryProjection summary) {
            if (summary == null || summary.reactorCount() == 0) {
                return null;
            }
            return new ReactionSummaryResponse(summary.latestReactorName(), summary.reactorCount() - 1);
        }
    }
}
