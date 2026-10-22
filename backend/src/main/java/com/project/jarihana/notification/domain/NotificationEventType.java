package com.project.jarihana.notification.domain;

public enum NotificationEventType {
    GROUP_CREATED,
    REGISTRATION_SUBMITTED,
    PARTICIPANT_JOINED,
    REGISTRATION_APPROVED,
    REGISTRATION_REJECTED,
    REGISTRATION_SYSTEM_REJECTED,
    INVITATION_RECEIVED,
    ACTIVITY_POST_COMMENTED,
    ACTIVITY_POST_REACTED;

    public boolean isActivityPostEvent() {
        return this == ACTIVITY_POST_COMMENTED || this == ACTIVITY_POST_REACTED;
    }
}
