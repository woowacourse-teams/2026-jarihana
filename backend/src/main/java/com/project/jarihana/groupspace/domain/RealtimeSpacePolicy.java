package com.project.jarihana.groupspace.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import java.time.LocalDateTime;

public final class RealtimeSpacePolicy {
    private RealtimeSpacePolicy() {
    }

    public static void requireOpen(GroupType type, GroupStatus status) {
        if (type == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.GROUP_SPACE_NOT_AVAILABLE, "같이해요 모임에는 아지트가 없습니다.");
        }
        if (status != GroupStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 입장할 수 없습니다.");
        }
    }

    public static void requireCurrentMember(LocalDateTime withdrawnAt) {
        if (withdrawnAt != null) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "아지트에 입장할 수 없습니다.");
        }
    }
}
