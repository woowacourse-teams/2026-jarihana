package com.project.jarihana.feedback.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.feedback.command.repository.FeedbackCommandRepository;
import com.project.jarihana.feedback.command.service.dto.CreateFeedbackCommand;
import com.project.jarihana.feedback.command.service.dto.CreateFeedbackResult;
import com.project.jarihana.feedback.domain.Feedback;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class FeedbackCommandService {

    private final FeedbackCommandRepository feedbackRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    @Transactional
    public CreateFeedbackResult createFeedback(Long memberId, CreateFeedbackCommand command) {
        Member member = memberId == null
                ? null
                : memberRepository.findById(memberId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        Feedback feedback = Feedback.create(command.content(), member, LocalDateTime.now(clock));
        return CreateFeedbackResult.from(feedbackRepository.save(feedback));
    }
}
