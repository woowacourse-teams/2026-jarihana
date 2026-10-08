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
    private final Long recruitmentId;
    private final Long registrationId;
    private final SystemRejectionReason reasonCode;

    private NotificationPayload(long groupId, Long recruitmentId, Long registrationId, SystemRejectionReason reasonCode) {
        if (groupId <= 0 || (recruitmentId != null && recruitmentId <= 0) || (registrationId != null && registrationId <= 0)
                || (recruitmentId == null) != (registrationId == null)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "알림의 업무 식별자는 양수여야 합니다.");
        }
        this.groupId = groupId;
        this.recruitmentId = recruitmentId;
        this.registrationId = registrationId;
        this.reasonCode = reasonCode;
    }

    public static NotificationPayload of(long groupId, long recruitmentId, long registrationId, SystemRejectionReason reasonCode) {
        return new NotificationPayload(groupId, recruitmentId, registrationId, reasonCode);
    }

    public static NotificationPayload forGroup(long groupId) {
        return new NotificationPayload(groupId, null, null, null);
    }

    @JsonCreator
    public static NotificationPayload from(
            @JsonProperty("groupId") long groupId,
            @JsonProperty("recruitmentId") Long recruitmentId,
            @JsonProperty("registrationId") Long registrationId,
            @JsonProperty("reasonCode") SystemRejectionReason reasonCode
    ) {
        return new NotificationPayload(groupId, recruitmentId, registrationId, reasonCode);
    }
}
