package com.project.jarihana.group.query.repository.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import java.util.List;

public record GroupListProjection(
        Long id,
        Group group,
        int memberCount,
        List<GroupListMember> members,
        GroupRecruitment activeRecruitment,
        int approvedCount
) {

    public GroupListProjection {
        if (id == null || group == null || memberCount < 0 || approvedCount < 0 || members == null) {
            throw new IllegalArgumentException("그룹 목록 조회 정보가 올바르지 않습니다.");
        }
        members = List.copyOf(members);
    }

    public GroupListMember leader() {
        return members.stream()
                .filter(member -> member.role() == GroupMemberRole.LEADER)
                .findFirst()
                .orElse(null);
    }

    public boolean hasMember(Long memberId) {
        return members.stream().anyMatch(member -> member.memberId().equals(memberId));
    }

    public boolean hasRole(Long memberId, GroupMemberRole role) {
        return members.stream()
                .anyMatch(member -> member.memberId().equals(memberId)
                        && member.role() == role);
    }

    public static GroupListProjection of(
            Long id,
            Group group,
            int memberCount,
            List<GroupListMember> members,
            GroupRecruitment activeRecruitment,
            int approvedCount
    ) {
        return new GroupListProjection(id, group, memberCount, members, activeRecruitment, approvedCount);
    }
}
