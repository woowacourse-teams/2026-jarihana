package com.project.jarihana.common.pagination;

import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.activitypost.query.repository.ActivityPostCommentQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostCommentReactionQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostReactionQueryRepository;
import com.project.jarihana.activitypost.query.repository.dto.ActivityPostCommentProjection;
import com.project.jarihana.activitypost.query.repository.dto.ActivityPostProjection;
import com.project.jarihana.activitypost.query.repository.dto.ReactorProjection;
import com.project.jarihana.announcement.query.repository.AnnouncementQueryRepository;
import com.project.jarihana.announcement.query.repository.dto.AnnouncementSummaryProjection;
import com.project.jarihana.common.pagination.CursorBounds;
import com.project.jarihana.gomoku.query.repository.GomokuGameQueryRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.query.repository.GroupMemberListJpaRepository;
import com.project.jarihana.invitation.query.repository.InvitationCandidateRepository;
import com.project.jarihana.invitation.query.repository.InvitationQueryRepository;
import com.project.jarihana.invitation.query.repository.dto.InvitationCandidateProjection;
import com.project.jarihana.invitation.query.repository.dto.IssuedInvitationProjection;
import com.project.jarihana.invitation.query.repository.dto.ReceivedInvitationProjection;
import com.project.jarihana.notification.query.repository.NotificationQueryRepository;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;
import com.project.jarihana.proposal.query.repository.ProposalCommentQueryRepository;
import com.project.jarihana.proposal.query.repository.ProposalQueryRepository;
import com.project.jarihana.proposal.query.repository.dto.ProposalCommentProjection;
import com.project.jarihana.proposal.query.repository.dto.ProposalSummaryProjection;
import com.project.jarihana.pushsubscription.query.repository.PushSubscriptionQueryRepository;
import com.project.jarihana.pushsubscription.query.repository.dto.PushSubscriptionProjection;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.query.repository.RegistrationListJpaRepository;
import com.project.jarihana.sparring.query.repository.SparringQueryRepository;
import com.project.jarihana.sparring.query.repository.dto.SparringTopicProjection;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 커서 조건을 바꿔도 페이지 경계의 결과가 그대로인지 확인한다.
 * 픽스처의 목록은 모두 "가장 늦은 행, 같은 시각 세 행, 가장 이른 행"이고, 크기 2로 조회하면
 * 첫 페이지, 같은 시각 행 사이의 경계, 마지막 페이지와 그 다음의 빈 페이지를 차례로 지난다.
 */
@SpringBootTest
@Import(TestSupportConfig.class)
@Sql(scripts = {"/sql/truncate.sql", "/sql/cursor-boundary.sql"},
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Transactional
class CursorBoundaryRegressionTest {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;
    private static final Pageable PAGE = Pageable.ofSize(2);
    private static final List<List<Long>> DESCENDING = List.of(List.of(1L, 4L), List.of(3L, 2L), List.of(5L));
    private static final List<List<Long>> ASCENDING = List.of(List.of(5L, 2L), List.of(3L, 4L), List.of(1L));

    @Autowired
    private ActivityPostQueryRepository activityPostQueryRepository;

    @Autowired
    private ActivityPostCommentQueryRepository activityPostCommentQueryRepository;

    @Autowired
    private ActivityPostReactionQueryRepository activityPostReactionQueryRepository;

    @Autowired
    private ActivityPostCommentReactionQueryRepository activityPostCommentReactionQueryRepository;

    @Autowired
    private NotificationQueryRepository notificationQueryRepository;

    @Autowired
    private AnnouncementQueryRepository announcementQueryRepository;

    @Autowired
    private GroupJpaRepository groupJpaRepository;

    @Autowired
    private GroupMemberListJpaRepository groupMemberListJpaRepository;

    @Autowired
    private GroupRecruitmentJpaRepository groupRecruitmentJpaRepository;

    @Autowired
    private RegistrationListJpaRepository registrationListJpaRepository;

    @Autowired
    private InvitationCandidateRepository invitationCandidateRepository;

    @Autowired
    private InvitationQueryRepository invitationQueryRepository;

    @Autowired
    private ProposalQueryRepository proposalQueryRepository;

    @Autowired
    private ProposalCommentQueryRepository proposalCommentQueryRepository;

    @Autowired
    private PushSubscriptionQueryRepository pushSubscriptionQueryRepository;

    @Autowired
    private SparringQueryRepository sparringQueryRepository;

    @Autowired
    private GomokuGameQueryRepository gomokuGameQueryRepository;

    @DisplayName("활동 기록 피드는 같은 활동 날짜 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void activityPostFeedKeepsOrderAcrossTiedCursor() {
        // Given: 활동 기록 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (ActivityPostProjection last) -> activityPostQueryRepository.findPage(null, false, null,
                        last == null ? CursorBounds.LATEST_DATE : last.activityDate(),
                        last == null ? CursorBounds.LAST_ID : last.id(),
                        NOW,
                        PAGE),
                ActivityPostProjection::id);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("활동 기록 댓글은 같은 작성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void activityPostCommentsKeepOrderAcrossTiedCursor() {
        // Given: 활동 기록 1의 댓글 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (ActivityPostCommentProjection last) -> activityPostCommentQueryRepository.findPage(1L, null,
                        last == null ? CursorBounds.EARLIEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.FIRST_ID : last.id(),
                        PAGE),
                ActivityPostCommentProjection::id);

        // Then
        assertThat(pages).isEqualTo(ASCENDING);
    }

    @DisplayName("활동 기록 반응한 사람 목록은 같은 반응 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void activityPostReactorsKeepOrderAcrossTiedCursor() {
        // Given: 활동 기록 1의 하트 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (ReactorProjection last) -> activityPostReactionQueryRepository.findReactors(1L, ReactionEmoji.HEART,
                        last == null ? CursorBounds.EARLIEST_TIME : last.reactedAt(),
                        last == null ? CursorBounds.FIRST_ID : last.reactionId(),
                        PAGE),
                ReactorProjection::reactionId);

        // Then
        assertThat(pages).isEqualTo(ASCENDING);
    }

    @DisplayName("댓글 반응한 사람 목록은 같은 반응 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void activityPostCommentReactorsKeepOrderAcrossTiedCursor() {
        // Given: 댓글 1의 하트 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (ReactorProjection last) -> activityPostCommentReactionQueryRepository.findReactors(1L,
                        ReactionEmoji.HEART, last == null ? CursorBounds.EARLIEST_TIME : last.reactedAt(),
                        last == null ? CursorBounds.FIRST_ID : last.reactionId(), PAGE),
                ReactorProjection::reactionId);

        // Then
        assertThat(pages).isEqualTo(ASCENDING);
    }

    @DisplayName("알림 목록은 같은 생성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void notificationsKeepOrderAcrossTiedCursor() {
        // Given: 회원 1의 알림 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (NotificationProjection last) -> notificationQueryRepository.findPage(1L,
                        last == null ? CursorBounds.LATEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.LAST_ID : last.id(),
                        PAGE)
                        .getContent(),
                NotificationProjection::id);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("공지 목록은 같은 작성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void announcementsKeepOrderAcrossTiedCursor() {
        // Given: 모임 1의 공지 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (AnnouncementSummaryProjection last) -> announcementQueryRepository.findPage(1L, true, null,
                        last == null ? CursorBounds.LATEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.LAST_ID : last.id(),
                        PAGE),
                AnnouncementSummaryProjection::id);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("모임 목록은 같은 생성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void groupsKeepOrderAcrossTiedCursor() {
        // Given: 활동 중인 모임 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (Group last) -> groupJpaRepository.findPage(GroupStatus.ACTIVE, null, null, null, null,
                        last == null ? CursorBounds.LATEST_TIME : last.getCreatedAt(),
                        last == null ? CursorBounds.LAST_ID : last.getId(),
                        false, null, null, null, NOW, null, PAGE).getContent(),
                Group::getId);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("모임 구성원 목록은 같은 가입 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void groupMembersKeepOrderAcrossTiedCursor() {
        // Given: 모임 1의 구성원 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (GroupMember last) -> groupMemberListJpaRepository.findPage(1L,
                        last == null ? CursorBounds.LATEST_TIME : last.getJoinedAt(),
                        last == null ? CursorBounds.LAST_ID : last.getId(),
                        PAGE)
                        .getContent(),
                GroupMember::getId);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("모집 목록은 같은 생성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void recruitmentsKeepOrderAcrossTiedCursor() {
        // Given: 모임 1의 모집 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (GroupRecruitment last) -> groupRecruitmentJpaRepository.findPageByGroupId(1L,
                        last == null ? CursorBounds.LATEST_TIME : last.getCreatedAt(),
                        last == null ? CursorBounds.LAST_ID : last.getId(),
                        PAGE)
                        .getContent(),
                GroupRecruitment::getId);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("모집의 신청자 목록은 같은 신청 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void registrationsOfRecruitmentKeepOrderAcrossTiedCursor() {
        // Given: 모집 1의 신청 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (Registration last) -> registrationListJpaRepository.findPage(1L, null,
                        last == null ? CursorBounds.LATEST_TIME : last.getRegisteredAt(),
                        last == null ? CursorBounds.LAST_ID : last.getId(),
                        PAGE)
                        .getContent(),
                Registration::getId);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("내 신청 목록은 같은 신청 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void myRegistrationsKeepOrderAcrossTiedCursor() {
        // Given: 회원 6의 신청 11~15

        // When
        List<List<Long>> pages = pagesOf(
                (Registration last) -> registrationListJpaRepository.findMyPage(6L, null,
                        last == null ? CursorBounds.LATEST_TIME : last.getRegisteredAt(),
                        last == null ? CursorBounds.LAST_ID : last.getId(),
                        PAGE)
                        .getContent(),
                Registration::getId);

        // Then
        assertThat(pages).isEqualTo(shifted(DESCENDING, 10));
    }

    @DisplayName("초대 후보 목록은 같은 가입 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void invitationCandidatesKeepOrderAcrossTiedCursor() {
        // Given: 모임 2에 속하지 않은 회원 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (InvitationCandidateProjection last) -> invitationCandidateRepository.findCandidates(2L, 6L, "",
                        last == null ? CursorBounds.LATEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.LAST_ID : last.memberId(),
                        PAGE)
                        .getContent(),
                InvitationCandidateProjection::memberId);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("보낸 초대 목록은 같은 생성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void issuedInvitationsKeepOrderAcrossTiedCursor() {
        // Given: 회원 6이 모임 2에서 보낸 초대 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (IssuedInvitationProjection last) -> invitationQueryRepository.findIssued(2L, 6L, false,
                        last == null ? CursorBounds.LATEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.LAST_ID : last.id(),
                        PAGE)
                        .getContent(),
                IssuedInvitationProjection::id);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("받은 초대 목록은 같은 생성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void receivedInvitationsKeepOrderAcrossTiedCursor() {
        // Given: 회원 6이 받은 초대 11~15

        // When
        List<List<Long>> pages = pagesOf(
                (ReceivedInvitationProjection last) -> invitationQueryRepository.findReceived(6L,
                        last == null ? CursorBounds.LATEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.LAST_ID : last.id(),
                        PAGE)
                        .getContent(),
                ReceivedInvitationProjection::id);

        // Then
        assertThat(pages).isEqualTo(shifted(DESCENDING, 10));
    }

    @DisplayName("모임 제안 목록은 같은 작성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void proposalsKeepOrderAcrossTiedCursor() {
        // Given: 제안 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (ProposalSummaryProjection last) -> proposalQueryRepository.findPage(null, null,
                        last == null ? CursorBounds.LATEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.LAST_ID : last.id(),
                        PAGE),
                ProposalSummaryProjection::id);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("모임 제안 댓글은 같은 작성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void proposalCommentsKeepOrderAcrossTiedCursor() {
        // Given: 제안 1의 댓글 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (ProposalCommentProjection last) -> proposalCommentQueryRepository.findPage(1L, null,
                        last == null ? CursorBounds.EARLIEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.FIRST_ID : last.id(),
                        PAGE),
                ProposalCommentProjection::id);

        // Then
        assertThat(pages).isEqualTo(ASCENDING);
    }

    @DisplayName("푸시 구독 목록은 같은 등록 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void pushSubscriptionsKeepOrderAcrossTiedCursor() {
        // Given: 회원 1의 푸시 구독 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (PushSubscriptionProjection last) -> pushSubscriptionQueryRepository.findPage(1L,
                        last == null ? CursorBounds.LATEST_TIME : last.createdAt(),
                        last == null ? CursorBounds.LAST_ID : last.id(),
                        PAGE)
                        .getContent(),
                PushSubscriptionProjection::id);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("토론 주제 목록은 같은 생성 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void sparringTopicsKeepOrderAcrossTiedCursor() {
        // Given: 토론 주제 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (SparringTopicProjection last) -> sparringQueryRepository.topics(null, "", "all", NOW,
                        last == null ? CursorBounds.LATEST_TIME : last.getCreatedAt(),
                        last == null ? CursorBounds.LAST_ID : last.getId(),
                        PAGE),
                SparringTopicProjection::getId);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    @DisplayName("오목 기록은 같은 종료 시각 사이에서 페이지가 끊겨도 순서를 유지한다.")
    @Test
    void gomokuHistoryKeepsOrderAcrossTiedCursor() {
        // Given: 회원 1이 둔 오목 1~5

        // When
        List<List<Long>> pages = pagesOf(
                (GomokuGameQueryRepository.History last) -> gomokuGameQueryRepository.history(1L,
                        last == null ? LocalDateTime.of(9999, 12, 31, 23, 59, 59) : last.getEndedAt(),
                        last == null ? Long.MAX_VALUE : last.getId(), PAGE.getPageSize()),
                GomokuGameQueryRepository.History::getId);

        // Then
        assertThat(pages).isEqualTo(DESCENDING);
    }

    private static <T> List<List<Long>> pagesOf(Function<T, List<T>> nextPage, Function<T, Long> idOf) {
        List<List<Long>> pages = new ArrayList<>();
        T last = null;
        for (int count = 0; count < 10; count++) {
            List<T> page = nextPage.apply(last);
            if (page.isEmpty()) {
                return pages;
            }
            pages.add(page.stream().map(idOf).toList());
            last = page.getLast();
        }
        throw new AssertionError("커서가 다음 페이지로 넘어가지 않는다.");
    }

    private static List<List<Long>> shifted(List<List<Long>> pages, long offset) {
        return pages.stream()
                .map(page -> page.stream().map(id -> id + offset).toList())
                .toList();
    }
}
