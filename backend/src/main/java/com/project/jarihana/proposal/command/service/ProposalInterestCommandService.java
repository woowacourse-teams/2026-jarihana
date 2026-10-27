package com.project.jarihana.proposal.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.proposal.command.repository.ProposalCommandRepository;
import com.project.jarihana.proposal.command.repository.ProposalInterestCommandRepository;
import com.project.jarihana.proposal.command.service.dto.SaveProposalInterestCommand;
import com.project.jarihana.proposal.domain.Proposal;
import com.project.jarihana.proposal.domain.ProposalInterest;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 함께하고 싶어요 응답을 저장하거나 취소한다. 목록에서 누른 응답은 조건 없이 저장하고,
 * 상세에서 조건을 보내면 같은 응답의 조건을 바꾼다.
 */
@Service
@RequiredArgsConstructor
public class ProposalInterestCommandService {

    private final ProposalCommandRepository proposalCommandRepository;
    private final ProposalInterestCommandRepository proposalInterestCommandRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    /**
     * 같은 회원의 요청이 동시에 와도 응답이 둘 생기지 않도록 회원 행을 잠근 뒤 기존 응답을 찾는다.
     */
    @Transactional
    public void save(SaveProposalInterestCommand command) {
        Member member = memberRepository.findWithLockById(command.memberId())
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        Proposal proposal = getActiveProposal(command.proposalId());
        ProposalInterest interest = proposalInterestCommandRepository
                .findByProposalIdAndMemberId(command.proposalId(), command.memberId())
                .map(existing -> existing.changeConditions(
                        command.timeSlots(),
                        command.meetingModes(),
                        command.moodIndexes()
                ))
                .orElseGet(() -> ProposalInterest.create(
                        proposal,
                        member,
                        command.timeSlots(),
                        command.meetingModes(),
                        command.moodIndexes(),
                        LocalDateTime.now(clock)
                ));
        proposalInterestCommandRepository.save(interest);
    }

    @Transactional
    public void cancel(long memberId, long proposalId) {
        getActiveProposal(proposalId);
        proposalInterestCommandRepository.findByProposalIdAndMemberId(proposalId, memberId)
                .ifPresent(proposalInterestCommandRepository::delete);
    }

    private Proposal getActiveProposal(long proposalId) {
        return proposalCommandRepository.findByIdAndDeletedAtIsNull(proposalId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PROPOSAL_NOT_FOUND, "모임 제안을 찾을 수 없습니다."));
    }
}
