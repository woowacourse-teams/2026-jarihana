package com.project.jarihana.groupmember.domain;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.domain.Member;
import java.time.LocalDateTime;

public final class GroupMember {

    private final Long id;
    private final Group group;
    private final Member member;
    private final GroupMemberRole role;
    private final LocalDateTime joinedAt;

    private GroupMember(
            Long id,
            Group group,
            Member member,
            GroupMemberRole role,
            LocalDateTime joinedAt
    ) {
        this.id = id;
        this.group = validateGroup(group);
        this.member = require(member, "회원");
        this.role = require(role, "구성원 역할");
        this.joinedAt = require(joinedAt, "가입 시각");
    }

    public static GroupMember createLeader(Group group, Member member, LocalDateTime joinedAt) {
        return new GroupMember(null, group, member, GroupMemberRole.LEADER, joinedAt);
    }

    public static GroupMember createMember(Group group, Member member, LocalDateTime joinedAt) {
        return new GroupMember(null, group, member, GroupMemberRole.MEMBER, joinedAt);
    }

    public LeadershipTransfer transferLeadershipTo(GroupMember successor) {
        if (role != GroupMemberRole.LEADER) {
            throw new IllegalStateException("현재 리더만 역할을 위임할 수 있습니다.");
        }
        GroupMember requiredSuccessor = require(successor, "후임 구성원");
        if (!belongsToSameGroup(requiredSuccessor)) {
            throw new IllegalArgumentException("같은 그룹의 구성원에게만 역할을 위임할 수 있습니다.");
        }
        if (requiredSuccessor.role != GroupMemberRole.MEMBER) {
            throw new IllegalArgumentException("일반 구성원에게만 역할을 위임할 수 있습니다.");
        }
        return LeadershipTransfer.of(
                withRole(GroupMemberRole.MEMBER),
                requiredSuccessor.withRole(GroupMemberRole.LEADER)
        );
    }

    public boolean canLeave() {
        return role == GroupMemberRole.MEMBER;
    }

    private boolean belongsToSameGroup(GroupMember other) {
        if (group == other.group) {
            return true;
        }
        return group.getId() != null && group.getId().equals(other.group.getId());
    }

    private GroupMember withRole(GroupMemberRole changedRole) {
        return new GroupMember(id, group, member, changedRole, joinedAt);
    }

    private static Group validateGroup(Group group) {
        Group requiredGroup = require(group, "그룹");
        if (!requiredGroup.isActive()) {
            throw new IllegalArgumentException("ACTIVE 상태의 그룹에만 구성원을 생성할 수 있습니다.");
        }
        return requiredGroup;
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new IllegalArgumentException(fieldName + "은 필수입니다.");
        }
        return value;
    }

    public Long getId() {
        return id;
    }

    public Group getGroup() {
        return group;
    }

    public Member getMember() {
        return member;
    }

    public GroupMemberRole getRole() {
        return role;
    }

    public LocalDateTime getJoinedAt() {
        return joinedAt;
    }
}
