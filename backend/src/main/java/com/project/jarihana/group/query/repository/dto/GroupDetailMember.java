package com.project.jarihana.group.query.repository.dto;

import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Member;

public record GroupDetailMember(Long memberId, Member member, GroupMemberRole role) {

    public GroupDetailMember {
        if (memberId == null || member == null || role == null) {
            throw new IllegalArgumentException("그룹 구성원 조회 정보는 필수입니다.");
        }
    }

    public static GroupDetailMember of(Long memberId, Member member, GroupMemberRole role) {
        return new GroupDetailMember(memberId, member, role);
    }
}
