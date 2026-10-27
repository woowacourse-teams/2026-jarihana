package com.project.jarihana.proposal.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.proposal.query.repository.ProposalCommentQueryRepository;
import com.project.jarihana.proposal.query.repository.ProposalQueryRepository;
import com.project.jarihana.proposal.query.repository.dto.ProposalCommentProjection;
import com.project.jarihana.proposal.query.service.dto.ProposalCommentListQuery;
import com.project.jarihana.proposal.query.service.dto.ProposalCommentListResult;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * 코멘트는 대화를 읽는 순서대로 작성 시각 오름차순으로 조회한다.
 */
@Service
@RequiredArgsConstructor
public class ProposalCommentQueryService {

    private static final int MAX_SIZE = 100;

    private final ProposalQueryRepository proposalQueryRepository;
    private final ProposalCommentQueryRepository proposalCommentQueryRepository;

    public ProposalCommentListResult findComments(long proposalId, ProposalCommentListQuery query, Long memberId) {
        if (query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw ProposalCursor.invalidParameter();
        }
        if (!proposalQueryRepository.existsByIdAndDeletedAtIsNull(proposalId)) {
            throw new BusinessException(ErrorCode.PROPOSAL_NOT_FOUND, "모임 제안을 찾을 수 없습니다.");
        }
        ProposalCursor cursor = ProposalCursor.decode(query.cursor());
        List<ProposalCommentProjection> candidates = proposalCommentQueryRepository.findPage(
                proposalId,
                memberId,
                cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(),
                Pageable.ofSize(query.size() + 1)
        );
        boolean hasNext = candidates.size() > query.size();
        List<ProposalCommentProjection> page = hasNext ? candidates.subList(0, query.size()) : candidates;
        ProposalCommentProjection last = page.isEmpty() ? null : page.get(page.size() - 1);
        String nextCursor = hasNext ? ProposalCursor.encode(last.createdAt(), last.id()) : null;
        return new ProposalCommentListResult(
                page.stream().map(comment -> new ProposalCommentListResult.Item(
                        comment.id(),
                        comment.authorNickname(),
                        GithubAvatarUrl.from(comment.authorGithubId()),
                        comment.content(),
                        comment.createdAt(),
                        comment.canDelete()
                )).toList(),
                nextCursor,
                hasNext
        );
    }
}
