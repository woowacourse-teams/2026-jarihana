package com.project.jarihana.groupmember.command.controller.dto;

import com.project.jarihana.groupmember.command.service.dto.TransferLeaderResult;

public record TransferLeaderResponse(
        long groupId,
        long previousLeaderGroupMemberId,
        long leaderGroupMemberId
) {

    public static TransferLeaderResponse from(TransferLeaderResult result) {
        return new TransferLeaderResponse(
                result.groupId(),
                result.previousLeaderGroupMemberId(),
                result.leaderGroupMemberId()
        );
    }
}
