package com.project.jarihana.proposal.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.proposal.command.repository.ProposalCommandRepository;
import com.project.jarihana.proposal.command.repository.ProposalCommentCommandRepository;
import com.project.jarihana.proposal.domain.Proposal;
import com.project.jarihana.proposal.domain.ProposalComment;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProposalCommentCommandService {

    private final ProposalCommandRepository proposalCommandRepository;
    private final ProposalCommentCommandRepository proposalCommentCommandRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    @Transactional
    public long create(long memberId, long proposalId, String content) {
        Proposal proposal = proposalCommandRepository.findByIdAndDeletedAtIsNull(proposalId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PROPOSAL_NOT_FOUND, "모임 제안을 찾을 수 없습니다."));
        Member author = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        ProposalComment comment = proposalCommentCommandRepository.save(
                ProposalComment.create(proposal, author, content, LocalDateTime.now(clock))
        );
        return comment.getId();
    }

    /**
     * 코멘트 작성자와 제안한 회원이 지울 수 있다.
     */
    @Transactional
    public void delete(long memberId, long commentId) {
        ProposalComment comment = proposalCommentCommandRepository
                .findByIdAndDeletedAtIsNullAndProposalDeletedAtIsNull(commentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PROPOSAL_COMMENT_NOT_FOUND,
                        "코멘트를 찾을 수 없습니다."
                ));
        if (!comment.isWrittenBy(memberId) && !comment.getProposal().isWrittenBy(memberId)) {
            throw new BusinessException(
                    ErrorCode.PROPOSAL_COMMENT_ACCESS_DENIED,
                    "코멘트 작성자 또는 제안한 회원만 코멘트를 지울 수 있습니다."
            );
        }
        proposalCommentCommandRepository.save(comment.deleteAt(LocalDateTime.now(clock)));
    }
}
