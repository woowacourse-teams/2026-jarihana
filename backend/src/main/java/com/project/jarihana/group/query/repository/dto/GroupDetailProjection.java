package com.project.jarihana.group.query.repository.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.registration.domain.RegistrationStatus;

import java.util.List;

public record GroupDetailProjection(
        Long id,
        Group group,
        List<GroupDetailMember> members,
        GroupRecruitment activeRecruitment,
        int approvedCount,
        Long currentMemberRegistrationId,
        RegistrationStatus currentMemberRegistrationStatus,
        String visibleAffiliationName
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
        return of(id, group, members, activeRecruitment, approvedCount, null, null);
    }

    public static GroupDetailProjection of(
            Long id,
            Group group,
            List<GroupDetailMember> members,
            GroupRecruitment activeRecruitment,
            int approvedCount,
            Long currentMemberRegistrationId,
            RegistrationStatus currentMemberRegistrationStatus
    ) {
        return new GroupDetailProjection(
                id,
                group,
                members,
                activeRecruitment,
                approvedCount,
                currentMemberRegistrationId,
                currentMemberRegistrationStatus,
                null
        );
    }

    /**
     * 소속 공개 모임이 정한 소속의 이름을 담는다. 다른 공개 범위에서는 비워 둔다.
     */
    public GroupDetailProjection withVisibleAffiliationName(String name) {
        return new GroupDetailProjection(
                id,
                group,
                members,
                activeRecruitment,
                approvedCount,
                currentMemberRegistrationId,
                currentMemberRegistrationStatus,
                name
        );
    }

    public GroupDetailMember leader() {
        return members.stream()
                .filter(member -> member.role() == GroupMemberRole.LEADER)
                .findFirst()
                .orElse(null);
    }

    public GroupMemberRole roleOf(Long memberId) {
        if (memberId == null) {
            return null;
        }
        return members.stream()
                .filter(member -> member.memberId().equals(memberId))
                .map(GroupDetailMember::role)
                .findFirst()
                .orElse(null);
    }
}
