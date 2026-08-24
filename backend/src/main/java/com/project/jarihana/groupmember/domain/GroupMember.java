package com.project.jarihana.groupmember.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(
        name = "group_member",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_group_member_group_member",
                columnNames = {"group_id", "member_id"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupMember extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private GroupMemberRole role;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    private GroupMember(
            Long id,
            Group group,
            Member member,
            GroupMemberRole role,
            LocalDateTime joinedAt
    ) {
        super(joinedAt);
        this.id = id;
        this.group = validateGroup(group);
        this.member = require(member, "회원");
        this.role = require(role, "구성원 역할");
        this.joinedAt = require(joinedAt, "가입 시각");
    }

    private static Group validateGroup(Group group) {
        Group requiredGroup = require(group, "그룹");
        if (!requiredGroup.isActive()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "ACTIVE 상태의 그룹에만 구성원을 생성할 수 있습니다.");
        }
        return requiredGroup;
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    public static GroupMember createLeader(Group group, Member member, LocalDateTime joinedAt) {
        return new GroupMember(null, group, member, GroupMemberRole.LEADER, joinedAt);
    }

    public static GroupMember createMember(Group group, Member member, LocalDateTime joinedAt) {
        return new GroupMember(null, group, member, GroupMemberRole.MEMBER, joinedAt);
    }

    public LeadershipTransfer transferLeadershipTo(GroupMember successor) {
        if (role != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "현재 리더만 역할을 위임할 수 있습니다.");
        }
        GroupMember requiredSuccessor = require(successor, "후임 구성원");
        if (!belongsToSameGroup(requiredSuccessor)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "같은 그룹의 구성원에게만 역할을 위임할 수 있습니다.");
        }
        if (requiredSuccessor.role != GroupMemberRole.MEMBER) {
            throw new BusinessException(
                    ErrorCode.GROUP_MEMBER_ALREADY_LEADER,
                    "이미 모임장인 구성원에게는 역할을 위임할 수 없습니다."
            );
        }
        return LeadershipTransfer.of(
                withRole(GroupMemberRole.MEMBER),
                requiredSuccessor.withRole(GroupMemberRole.LEADER)
        );
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

    public boolean canLeave() {
        return role == GroupMemberRole.MEMBER;
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

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof GroupMember other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }
}
