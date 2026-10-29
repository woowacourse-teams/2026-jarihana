package com.project.jarihana.notification.query.service.dto;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

public enum NotificationClientVersion {
    LEGACY,
    ANNOUNCEMENTS;

    public static NotificationClientVersion from(int value) {
        if (value == 1) {
            return LEGACY;
        }
        if (value == 2) {
            return ANNOUNCEMENTS;
        }
        throw new BusinessException(ErrorCode.INVALID_PARAMETER, "지원하지 않는 알림 클라이언트 버전입니다.");
    }

    public boolean includesAnnouncements() {
        return this == ANNOUNCEMENTS;
    }
}
