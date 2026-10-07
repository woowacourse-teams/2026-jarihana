package com.project.jarihana.notification.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import lombok.EqualsAndHashCode;
import lombok.Getter;

@Getter
@EqualsAndHashCode
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class NotificationPayload {

    private final long groupId;
    private final long recruitmentId;
    private final long registrationId;
    private final SystemRejectionReason reasonCode;

    private NotificationPayload(long groupId, long recruitmentId, long registrationId, SystemRejectionReason reasonCode) {
        if (groupId <= 0 || recruitmentId <= 0 || registrationId <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "알림의 업무 식별자는 양수여야 합니다.");
        }
        this.groupId = groupId;
        this.recruitmentId = recruitmentId;
        this.registrationId = registrationId;
        this.reasonCode = reasonCode;
    }

    @JsonCreator
    public static NotificationPayload of(
            @JsonProperty("groupId") long groupId,
            @JsonProperty("recruitmentId") long recruitmentId,
            @JsonProperty("registrationId") long registrationId,
            @JsonProperty("reasonCode") SystemRejectionReason reasonCode
    ) {
        return new NotificationPayload(groupId, recruitmentId, registrationId, reasonCode);
    }
}
