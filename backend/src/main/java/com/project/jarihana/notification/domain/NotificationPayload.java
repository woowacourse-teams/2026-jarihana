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
    private final Long activityPostId;
    private final SystemRejectionReason reasonCode;

    private NotificationPayload(long groupId, Long recruitmentId, Long registrationId, Long invitationId,
                                Long activityPostId, SystemRejectionReason reasonCode) {
        boolean registration = recruitmentId != null && recruitmentId > 0 && registrationId != null
                && registrationId > 0 && invitationId == null && activityPostId == null;
        boolean invitation = invitationId != null && invitationId > 0 && recruitmentId == null
                && registrationId == null && activityPostId == null && reasonCode == null;
        boolean activityPost = activityPostId != null && activityPostId > 0 && recruitmentId == null
                && registrationId == null && invitationId == null && reasonCode == null;
        boolean group = recruitmentId == null && registrationId == null && invitationId == null
                && activityPostId == null && reasonCode == null;
        if (groupId <= 0 || (!registration && !invitation && !activityPost && !group)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "알림의 업무 식별자는 양수여야 합니다.");
        }
        this.groupId = groupId;
        this.recruitmentId = recruitmentId;
        this.registrationId = registrationId;
        this.invitationId = invitationId;
        this.activityPostId = activityPostId;
        this.reasonCode = reasonCode;
    }

    public static NotificationPayload of(long groupId, long recruitmentId, long registrationId, SystemRejectionReason reasonCode) {
        return new NotificationPayload(groupId, recruitmentId, registrationId, null, null, reasonCode);
    }

    public static NotificationPayload invitation(long groupId, long invitationId) {
        return new NotificationPayload(groupId, null, null, invitationId, null, null);
    }

    public static NotificationPayload activityPost(long groupId, long activityPostId) {
        return new NotificationPayload(groupId, null, null, null, activityPostId, null);
    }

    public static NotificationPayload forGroup(long groupId) {
        return new NotificationPayload(groupId, null, null, null, null, null);
    }

    @JsonCreator
    public static NotificationPayload from(
            @JsonProperty("groupId") long groupId,
            @JsonProperty("recruitmentId") Long recruitmentId,
            @JsonProperty("registrationId") Long registrationId,
            @JsonProperty("invitationId") Long invitationId,
            @JsonProperty("activityPostId") Long activityPostId,
            @JsonProperty("reasonCode") SystemRejectionReason reasonCode
    ) {
        return new NotificationPayload(groupId, recruitmentId, registrationId, invitationId, activityPostId, reasonCode);
    }
}
