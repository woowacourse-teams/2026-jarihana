package com.project.jarihana.proposal.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.proposal.domain.ProposalMeetingMode;
import com.project.jarihana.proposal.domain.ProposalTimeSlot;
import com.project.jarihana.proposal.query.repository.ProposalInterestQueryRepository;
import com.project.jarihana.proposal.query.repository.ProposalQueryRepository;
import com.project.jarihana.proposal.query.repository.dto.ProposalDetailProjection;
import com.project.jarihana.proposal.query.repository.dto.ProposalInterestProjection;
import com.project.jarihana.proposal.query.repository.dto.ProposalSummaryProjection;
import com.project.jarihana.proposal.query.service.dto.ProposalDetailResult;
import com.project.jarihana.proposal.query.service.dto.ProposalListQuery;
import com.project.jarihana.proposal.query.service.dto.ProposalListResult;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * 모임 제안은 최신순으로 조회한다. 상세의 조건별 인원은 한 제안의 응답만 읽어 모은다.
 */
@Service
@RequiredArgsConstructor
public class ProposalQueryService {

    private static final int MAX_SIZE = 100;

    private final ProposalQueryRepository proposalQueryRepository;
    private final ProposalInterestQueryRepository proposalInterestQueryRepository;

    public ProposalListResult findProposals(ProposalListQuery query, Long memberId) {
        if (query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw ProposalCursor.invalidParameter();
        }
        ProposalCursor cursor = ProposalCursor.decode(query.cursor());
        List<ProposalSummaryProjection> candidates = proposalQueryRepository.findPage(
                query.category(),
                memberId,
                cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(),
                Pageable.ofSize(query.size() + 1)
        );
        boolean hasNext = candidates.size() > query.size();
        List<ProposalSummaryProjection> page = hasNext ? candidates.subList(0, query.size()) : candidates;
        ProposalSummaryProjection last = page.isEmpty() ? null : page.get(page.size() - 1);
        String nextCursor = hasNext ? ProposalCursor.encode(last.createdAt(), last.id()) : null;
        return new ProposalListResult(
                page.stream().map(proposal -> new ProposalListResult.Item(
                        proposal.id(),
                        proposal.category(),
                        proposal.title(),
                        proposal.content(),
                        proposal.authorNickname(),
                        GithubAvatarUrl.from(proposal.authorGithubId()),
                        proposal.interestCount(),
                        proposal.commentCount(),
                        proposal.interested(),
                        proposal.createdAt()
                )).toList(),
                nextCursor,
                hasNext
        );
    }

    public ProposalDetailResult findProposal(long proposalId, Long memberId) {
        ProposalDetailProjection proposal = proposalQueryRepository.findDetail(proposalId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PROPOSAL_NOT_FOUND, "모임 제안을 찾을 수 없습니다."));
        List<ProposalInterestProjection> interests = proposalInterestQueryRepository.findAllByProposal(proposalId);
        return new ProposalDetailResult(
                proposal.id(),
                proposal.category(),
                proposal.title(),
                proposal.content(),
                proposal.authorNickname(),
                GithubAvatarUrl.from(proposal.authorGithubId()),
                proposal.createdAt(),
                proposal.moodOptions(),
                interests.size(),
                proposal.commentCount(),
                countTimeSlots(interests),
                countMeetingModes(interests),
                countMoods(interests, proposal.moodOptions().size()),
                findMyInterest(interests, memberId),
                proposal.writtenByViewer()
        );
    }

    private static List<ProposalDetailResult.TimeSlotCount> countTimeSlots(List<ProposalInterestProjection> interests) {
        return Arrays.stream(ProposalTimeSlot.values())
                .map(timeSlot -> new ProposalDetailResult.TimeSlotCount(
                        timeSlot,
                        interests.stream().filter(interest -> interest.timeSlots().contains(timeSlot)).count()
                ))
                .toList();
    }

    private static List<ProposalDetailResult.MeetingModeCount> countMeetingModes(
            List<ProposalInterestProjection> interests
    ) {
        return Arrays.stream(ProposalMeetingMode.values())
                .map(meetingMode -> new ProposalDetailResult.MeetingModeCount(
                        meetingMode,
                        interests.stream().filter(interest -> interest.meetingModes().contains(meetingMode)).count()
                ))
                .toList();
    }

    private static List<Long> countMoods(List<ProposalInterestProjection> interests, int optionCount) {
        return IntStream.range(0, optionCount)
                .mapToObj(index -> interests.stream().filter(interest -> interest.moodIndexes().contains(index)).count())
                .toList();
    }

    private static ProposalDetailResult.MyInterest findMyInterest(
            List<ProposalInterestProjection> interests,
            Long memberId
    ) {
        if (memberId == null) {
            return null;
        }
        return interests.stream()
                .filter(interest -> memberId.equals(interest.memberId()))
                .findFirst()
                .map(interest -> new ProposalDetailResult.MyInterest(
                        interest.timeSlots().stream().sorted().toList(),
                        interest.meetingModes().stream().sorted().toList(),
                        interest.moodIndexes().stream().sorted().toList()
                ))
                .orElse(null);
    }
}
