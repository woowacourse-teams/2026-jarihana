package com.project.jarihana.group.query.repository.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.recruitment.domain.GroupRecruitment;

import java.util.List;

public record GroupDetailProjection(
        Long id,
        Group group,
        List<GroupDetailMember> members,
        GroupRecruitment activeRecruitment,
        int approvedCount
) {

    public GroupDetailProjection {
        if (id == null || group == null || members == null || approvedCount < 0) {
            throw new IllegalArgumentException("그룹 상세 조회 정보가 올바르지 않습니다.");
        }
        members = List.copyOf(members);
    }

    public static GroupDetailProjection of(
            Long id,
            Group group,
            List<GroupDetailMember> members,
            GroupRecruitment activeRecruitment,
            int approvedCount
    ) {
        return new GroupDetailProjection(id, group, members, activeRecruitment, approvedCount);
    }

    public GroupDetailMember leader() {
        return members.stream()
                .filter(member -> member.role() == GroupMemberRole.LEADER)
                .findFirst()
                .orElse(null);
    }
}
