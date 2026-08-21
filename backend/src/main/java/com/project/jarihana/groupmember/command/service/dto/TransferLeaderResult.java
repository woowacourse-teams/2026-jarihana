package com.project.jarihana.groupmember.command.service.dto;

public record TransferLeaderResult(
        long groupId,
        long previousLeaderGroupMemberId,
        long leaderGroupMemberId
) {
}
