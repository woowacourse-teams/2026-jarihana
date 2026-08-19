package com.project.jarihana.groupmember.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GroupMemberTest {

    private static final LocalDateTime GROUP_CREATED_AT = LocalDateTime.of(2026, 8, 10, 10, 0);
    private static final LocalDateTime JOINED_AT = LocalDateTime.of(2026, 8, 18, 10, 0);

    @DisplayName("활동 중인 그룹의 리더와 일반 구성원을 생성한다.")
    @Test
    void createGroupMembers() {
        // Given
        Group group = group("러닝크루");
        Member leaderMember = member("우주", "100");
        Member regularMember = member("바다", "200");

        // When
        GroupMember leader = GroupMember.createLeader(group, leaderMember, JOINED_AT);
        GroupMember member = GroupMember.createMember(group, regularMember, JOINED_AT);

        // Then
        assertThat(leader.getGroup()).isSameAs(group);
        assertThat(leader.getMember()).isSameAs(leaderMember);
        assertThat(leader.getRole()).isEqualTo(GroupMemberRole.LEADER);
        assertThat(member.getRole()).isEqualTo(GroupMemberRole.MEMBER);
        assertThat(leader.getJoinedAt()).isEqualTo(JOINED_AT);
    }

    @DisplayName("종료된 그룹에는 구성원을 생성할 수 없다.")
    @Test
    void endedGroupCannotCreateMember() {
        // Given
        Group endedGroup = group("러닝크루").endAt(GROUP_CREATED_AT.plusHours(25));

        // When & Then
        assertThatThrownBy(() -> GroupMember.createMember(
                endedGroup,
                member("바다", "200"),
                JOINED_AT
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("일반 구성원만 즉시 그룹에서 나갈 수 있다.")
    @Test
    void onlyRegularMemberCanLeave() {
        // Given
        Group group = group("러닝크루");
        GroupMember leader = GroupMember.createLeader(group, member("우주", "100"), JOINED_AT);
        GroupMember regularMember = GroupMember.createMember(group, member("바다", "200"), JOINED_AT);

        // When & Then
        assertThat(leader.canLeave()).isFalse();
        assertThat(regularMember.canLeave()).isTrue();
    }

    @DisplayName("리더는 같은 그룹의 일반 구성원에게 역할을 위임하고 원본 두 객체를 유지한다.")
    @Test
    void transferLeadershipImmutably() {
        // Given
        Group group = group("러닝크루");
        GroupMember originalLeader = GroupMember.createLeader(group, member("우주", "100"), JOINED_AT);
        GroupMember originalSuccessor = GroupMember.createMember(group, member("바다", "200"), JOINED_AT);

        // When
        LeadershipTransfer transfer = originalLeader.transferLeadershipTo(originalSuccessor);

        // Then
        assertThat(transfer.getFormerLeader().getRole()).isEqualTo(GroupMemberRole.MEMBER);
        assertThat(transfer.getNewLeader().getRole()).isEqualTo(GroupMemberRole.LEADER);
        assertThat(transfer.getFormerLeader().getMember()).isSameAs(originalLeader.getMember());
        assertThat(transfer.getNewLeader().getMember()).isSameAs(originalSuccessor.getMember());
        assertThat(originalLeader.getRole()).isEqualTo(GroupMemberRole.LEADER);
        assertThat(originalSuccessor.getRole()).isEqualTo(GroupMemberRole.MEMBER);
    }

    @DisplayName("일반 구성원은 리더 역할을 위임할 수 없다.")
    @Test
    void regularMemberCannotTransferLeadership() {
        // Given
        Group group = group("러닝크루");
        GroupMember member = GroupMember.createMember(group, member("우주", "100"), JOINED_AT);
        GroupMember successor = GroupMember.createMember(group, member("바다", "200"), JOINED_AT);

        // When & Then
        assertThatThrownBy(() -> member.transferLeadershipTo(successor))
                .isInstanceOf(IllegalStateException.class);
    }

    @DisplayName("다른 그룹의 구성원에게 리더 역할을 위임할 수 없다.")
    @Test
    void successorMustBelongToSameGroup() {
        // Given
        GroupMember leader = GroupMember.createLeader(
                group("러닝크루"),
                member("우주", "100"),
                JOINED_AT
        );
        GroupMember successor = GroupMember.createMember(
                group("자바스터디"),
                member("바다", "200"),
                JOINED_AT
        );

        // When & Then
        assertThatThrownBy(() -> leader.transferLeadershipTo(successor))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("이미 리더인 구성원에게 리더 역할을 위임할 수 없다.")
    @Test
    void successorMustBeRegularMember() {
        // Given
        Group group = group("러닝크루");
        GroupMember leader = GroupMember.createLeader(group, member("우주", "100"), JOINED_AT);
        GroupMember anotherLeader = GroupMember.createLeader(group, member("바다", "200"), JOINED_AT);

        // When & Then
        assertThatThrownBy(() -> leader.transferLeadershipTo(anotherLeader))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private Group group(String name) {
        return Group.createClub(name, "함께 활동해요", null, null, null, GROUP_CREATED_AT);
    }

    private Member member(String crewName, String githubId) {
        return Member.create(crewName, 8, githubId, Course.BACKEND);
    }
}
