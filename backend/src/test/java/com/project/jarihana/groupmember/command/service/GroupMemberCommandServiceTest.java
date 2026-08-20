package com.project.jarihana.groupmember.command.service;

import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.command.service.dto.TransferLeaderCommand;
import com.project.jarihana.groupmember.command.service.dto.TransferLeaderResult;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import jakarta.persistence.EntityManager;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GroupMemberCommandServiceTest extends IntegrationTestSupport {

    @Autowired
    private GroupMemberCommandService groupMemberCommandService;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private GroupJpaRepository groupJpaRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberJpaRepository;

    @Autowired
    private EntityManager entityManager;

    @DisplayName("현재 모임장이 일반 구성원에게 역할을 위임하면 두 역할이 교체된다.")
    @Test
    void transfersLeadership() {
        // Given
        Member leaderMember = saveMember("가온", "leader-transfer-success");
        Member successorMember = saveMember("누리", "successor-transfer-success");
        Group group = saveActiveGroup("역할 위임 그룹");
        GroupMember leader = groupMemberJpaRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember successor = groupMemberJpaRepository.save(
                GroupMember.createMember(group, successorMember, TestSupportConfig.FIXED_NOW));

        // When
        TransferLeaderResult result = groupMemberCommandService.transferLeader(
                leaderMember.getId(),
                group.getId(),
                new TransferLeaderCommand(successor.getId())
        );
        entityManager.clear();

        // Then
        assertThat(result).isEqualTo(new TransferLeaderResult(group.getId(), leader.getId(), successor.getId()));
        assertThat(groupMemberJpaRepository.findById(leader.getId()).orElseThrow().getRole())
                .isEqualTo(GroupMemberRole.MEMBER);
        assertThat(groupMemberJpaRepository.findById(successor.getId()).orElseThrow().getRole())
                .isEqualTo(GroupMemberRole.LEADER);
    }

    @DisplayName("존재하지 않는 그룹에는 모임장 역할을 위임할 수 없다.")
    @Test
    void transferLeadershipFailsWhenGroupDoesNotExist() {
        assertThatThrownBy(() -> groupMemberCommandService.transferLeader(
                1L,
                999_999L,
                new TransferLeaderCommand(1L)
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_NOT_FOUND);
    }

    @DisplayName("현재 모임장이 아닌 구성원은 모임장 역할을 위임할 수 없다.")
    @Test
    void transferLeadershipFailsWhenRequesterIsNotLeader() {
        // Given
        Member requester = saveMember("다온", "requester-transfer-not-leader");
        Member leaderMember = saveMember("라온", "leader-transfer-not-leader");
        Group group = saveActiveGroup("위임 권한 그룹");
        GroupMember requesterGroupMember = groupMemberJpaRepository.save(
                GroupMember.createMember(group, requester, TestSupportConfig.FIXED_NOW));
        groupMemberJpaRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));

        // When / Then
        assertThatThrownBy(() -> groupMemberCommandService.transferLeader(
                requester.getId(),
                group.getId(),
                new TransferLeaderCommand(requesterGroupMember.getId())
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("종료된 그룹은 모임장 역할을 위임할 수 없다.")
    @Test
    void transferLeadershipFailsWhenGroupIsEnded() {
        // Given
        Member leaderMember = saveMember("마루", "leader-transfer-ended");
        Member successorMember = saveMember("보라", "successor-transfer-ended");
        Group group = saveActiveGroup("종료된 위임 그룹");
        groupMemberJpaRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember successor = groupMemberJpaRepository.save(
                GroupMember.createMember(group, successorMember, TestSupportConfig.FIXED_NOW));
        groupJpaRepository.save(group.endAt(TestSupportConfig.FIXED_NOW.plusDays(1).plusMinutes(1)));
        entityManager.clear();

        // When / Then
        assertThatThrownBy(() -> groupMemberCommandService.transferLeader(
                leaderMember.getId(),
                group.getId(),
                new TransferLeaderCommand(successor.getId())
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.LEADER_DELEGATION_NOT_ALLOWED_FOR_ENDED_GROUP);
    }

    @DisplayName("대상 구성원이 해당 그룹에 없으면 모임장 역할을 위임할 수 없다.")
    @Test
    void transferLeadershipFailsWhenSuccessorDoesNotExistInGroup() {
        // Given
        Member leaderMember = saveMember("새봄", "leader-transfer-missing-successor");
        Group group = saveActiveGroup("대상 없는 위임 그룹");
        groupMemberJpaRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));

        // When / Then
        assertThatThrownBy(() -> groupMemberCommandService.transferLeader(
                leaderMember.getId(),
                group.getId(),
                new TransferLeaderCommand(999_999L)
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_MEMBER_NOT_FOUND);
    }

    @DisplayName("현재 모임장 자신에게는 모임장 역할을 위임할 수 없다.")
    @Test
    void transferLeadershipFailsWhenSuccessorIsCurrentLeader() {
        // Given
        Member leaderMember = saveMember("여름", "leader-transfer-self");
        Group group = saveActiveGroup("자기 위임 그룹");
        GroupMember leader = groupMemberJpaRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));

        // When / Then
        assertThatThrownBy(() -> groupMemberCommandService.transferLeader(
                leaderMember.getId(),
                group.getId(),
                new TransferLeaderCommand(leader.getId())
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_MEMBER_ALREADY_LEADER);
    }

    @DisplayName("같은 모임장의 동시 역할 위임은 하나만 성공하고 모임장 한 명을 유지한다.")
    @Test
    void serializesConcurrentLeadershipTransfers() throws Exception {
        // Given
        Member leaderMember = saveMember("이든", "leader-transfer-concurrent");
        Member firstSuccessorMember = saveMember("초롱", "first-successor-transfer-concurrent");
        Member secondSuccessorMember = saveMember("하람", "second-successor-transfer-concurrent");
        Group group = saveActiveGroup("동시 역할 위임 그룹");
        groupMemberJpaRepository.save(
                GroupMember.createLeader(group, leaderMember, TestSupportConfig.FIXED_NOW));
        GroupMember firstSuccessor = groupMemberJpaRepository.save(
                GroupMember.createMember(group, firstSuccessorMember, TestSupportConfig.FIXED_NOW));
        GroupMember secondSuccessor = groupMemberJpaRepository.save(
                GroupMember.createMember(group, secondSuccessorMember, TestSupportConfig.FIXED_NOW));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<TransferOutcome> first = executor.submit(() -> transferWhenReleased(
                    start, leaderMember.getId(), group.getId(), firstSuccessor.getId()));
            Future<TransferOutcome> second = executor.submit(() -> transferWhenReleased(
                    start, leaderMember.getId(), group.getId(), secondSuccessor.getId()));

            // When
            start.countDown();
            List<TransferOutcome> outcomes = List.of(first.get(5, SECONDS), second.get(5, SECONDS));

            // Then
            assertThat(outcomes).containsExactlyInAnyOrder(TransferOutcome.SUCCESS, TransferOutcome.ACCESS_DENIED);
            assertThat(groupMemberJpaRepository.findAllByGroup_IdInOrderById(List.of(group.getId())))
                    .filteredOn(groupMember -> groupMember.getRole() == GroupMemberRole.LEADER)
                    .hasSize(1);
        } finally {
            executor.shutdownNow();
        }
    }

    private Member saveMember(String crewName, String githubId) {
        return memberRepository.save(Member.create(crewName, 8, githubId, Course.BACKEND));
    }

    private Group saveActiveGroup(String name) {
        return groupJpaRepository.save(Group.createStudy(
                name,
                "함께 활동해요",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                TestSupportConfig.FIXED_NOW
        ));
    }

    private TransferOutcome transferWhenReleased(
            CountDownLatch start,
            long memberId,
            long groupId,
            long successorGroupMemberId
    ) {
        try {
            if (!start.await(3, SECONDS)) {
                throw new IllegalStateException("동시 역할 위임 시작 대기 시간이 초과되었습니다.");
            }
            groupMemberCommandService.transferLeader(
                    memberId,
                    groupId,
                    new TransferLeaderCommand(successorGroupMemberId)
            );
            return TransferOutcome.SUCCESS;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시 역할 위임 테스트가 중단되었습니다.", exception);
        } catch (BusinessException exception) {
            if (exception.getErrorCode() == ErrorCode.GROUP_ACCESS_DENIED) {
                return TransferOutcome.ACCESS_DENIED;
            }
            throw exception;
        }
    }

    private enum TransferOutcome {
        SUCCESS,
        ACCESS_DENIED
    }
}
