package com.project.jarihana.notification.query.controller.dto;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.query.service.dto.PushContentResult;
import com.fasterxml.jackson.annotation.JsonInclude;
public record PushContentResponse(long notificationId, String eventType, int payloadVersion, PayloadResponse payload) {
    public static PushContentResponse from(PushContentResult result) {
        return new PushContentResponse(result.notificationId(), result.eventType().name(), result.payloadVersion(), PayloadResponse.from(result.payload()));
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PayloadResponse(long groupId, Long recruitmentId, Long registrationId, String reasonCode) {
        static PayloadResponse from(NotificationPayload payload) {
            return new PayloadResponse(payload.getGroupId(), payload.getRecruitmentId(), payload.getRegistrationId(),
                    payload.getReasonCode() == null ? null : payload.getReasonCode().name());
        }
    }
}
