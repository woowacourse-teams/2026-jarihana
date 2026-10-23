package com.project.jarihana.group.query.repository.dto;

import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;

public record GroupDetailMember(
        Long memberId,
        String crewName,
        Integer generation,
        MemberType memberType,
        String githubId,
        GroupMemberRole role
) {

    public GroupDetailMember {
        if (memberId == null || crewName == null || memberType == null || githubId == null || role == null) {
            throw new IllegalArgumentException("그룹 구성원 조회 정보는 필수입니다.");
        }
    }

    public static GroupDetailMember of(Long memberId, Member member, GroupMemberRole role) {
        return new GroupDetailMember(
                memberId, member.getCrewName(), member.getGeneration(), member.getMemberType(), member.getGithubId(), role
        );
    }
}
