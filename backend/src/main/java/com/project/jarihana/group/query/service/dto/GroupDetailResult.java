package com.project.jarihana.group.query.service.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.recruitment.domain.GroupRecruitment;

import java.util.List;

public record GroupDetailResult(
        Group group,
        String representativeImageUrl,
        List<GroupDetailMember> members,
        GroupRecruitment activeRecruitment,
        int approvedCount
) {

    public GroupDetailResult {
        if (group == null || members == null || approvedCount < 0) {
            throw new IllegalArgumentException("그룹 상세 조회 결과가 올바르지 않습니다.");
        }
        members = List.copyOf(members);
    }

    public GroupDetailMember leader() {
        return members.stream()
                .filter(member -> member.role() == GroupMemberRole.LEADER)
                .findFirst()
                .orElse(null);
    }
}
