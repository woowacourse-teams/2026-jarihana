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
    private final Long invitationId;
    private final SystemRejectionReason reasonCode;

    private NotificationPayload(long groupId, Long recruitmentId, Long registrationId, Long invitationId,
                                SystemRejectionReason reasonCode) {
        boolean registration = recruitmentId != null && recruitmentId > 0 && registrationId != null
                && registrationId > 0 && invitationId == null;
        boolean invitation = invitationId != null && invitationId > 0 && recruitmentId == null
                && registrationId == null && reasonCode == null;
        boolean group = recruitmentId == null && registrationId == null && invitationId == null && reasonCode == null;
        if (groupId <= 0 || (!registration && !invitation && !group)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "알림의 업무 식별자는 양수여야 합니다.");
        }
        this.groupId = groupId;
        this.recruitmentId = recruitmentId;
        this.registrationId = registrationId;
        this.invitationId = invitationId;
        this.reasonCode = reasonCode;
    }

    public static NotificationPayload of(long groupId, long recruitmentId, long registrationId, SystemRejectionReason reasonCode) {
        return new NotificationPayload(groupId, recruitmentId, registrationId, null, reasonCode);
    }

    public static NotificationPayload invitation(long groupId, long invitationId) {
        return new NotificationPayload(groupId, null, null, invitationId, null);
    }

    public static NotificationPayload forGroup(long groupId) {
        return new NotificationPayload(groupId, null, null, null, null);
    }

    @JsonCreator
    public static NotificationPayload from(
            @JsonProperty("groupId") long groupId,
            @JsonProperty("recruitmentId") Long recruitmentId,
            @JsonProperty("registrationId") Long registrationId,
            @JsonProperty("invitationId") Long invitationId,
            @JsonProperty("reasonCode") SystemRejectionReason reasonCode
    ) {
        return new NotificationPayload(groupId, recruitmentId, registrationId, invitationId, reasonCode);
    }
}
