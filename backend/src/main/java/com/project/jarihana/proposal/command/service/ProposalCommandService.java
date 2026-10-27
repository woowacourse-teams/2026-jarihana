package com.project.jarihana.proposal.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.proposal.command.repository.ProposalCommandRepository;
import com.project.jarihana.proposal.command.service.dto.CreateProposalCommand;
import com.project.jarihana.proposal.domain.Proposal;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProposalCommandService {

    private final ProposalCommandRepository proposalCommandRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    @Transactional
    public long create(CreateProposalCommand command) {
        Member author = memberRepository.findById(command.memberId())
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        Proposal proposal = proposalCommandRepository.save(Proposal.create(
                author,
                command.category(),
                command.title(),
                command.content(),
                command.moodOptions(),
                LocalDateTime.now(clock)
        ));
        return proposal.getId();
    }

    @Transactional
    public void delete(long memberId, long proposalId) {
        Proposal proposal = proposalCommandRepository.findByIdAndDeletedAtIsNull(proposalId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PROPOSAL_NOT_FOUND, "모임 제안을 찾을 수 없습니다."));
        if (!proposal.isWrittenBy(memberId)) {
            throw new BusinessException(ErrorCode.PROPOSAL_ACCESS_DENIED, "제안한 회원만 글을 지울 수 있습니다.");
        }
        proposalCommandRepository.save(proposal.deleteAt(LocalDateTime.now(clock)));
    }
}
