package com.project.jarihana.group.query.repository.dto;

import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;

public record GroupListMember(
        Long groupId,
        Long memberId,
        String crewName,
        Integer generation,
        MemberType memberType,
        String githubId,
        GroupMemberRole role
) {

    public GroupListMember {
        if (groupId == null || memberId == null || crewName == null || memberType == null || githubId == null || role == null) {
            throw new IllegalArgumentException("그룹 구성원 조회 정보는 필수입니다.");
        }
    }

    public static GroupListMember of(Long groupId, Long memberId, Member member, GroupMemberRole role) {
        return new GroupListMember(
                groupId, memberId, member.getCrewName(), member.getGeneration(), member.getMemberType(), member.getGithubId(), role
        );
    }
}
