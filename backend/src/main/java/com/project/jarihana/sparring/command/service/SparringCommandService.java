package com.project.jarihana.sparring.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.sparring.command.repository.SparringPostCommandRepository;
import com.project.jarihana.sparring.command.repository.SparringTopicCommandRepository;
import com.project.jarihana.sparring.command.repository.SparringVoteCommandRepository;
import com.project.jarihana.sparring.command.service.dto.CreateSparringCommand;
import com.project.jarihana.sparring.command.service.dto.PostSparringCommand;
import com.project.jarihana.sparring.command.service.dto.SparringCommandResult;
import com.project.jarihana.sparring.domain.SparringPost;
import com.project.jarihana.sparring.domain.SparringSide;
import com.project.jarihana.sparring.domain.SparringTopic;
import com.project.jarihana.sparring.domain.SparringVote;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class SparringCommandService {
    private final SparringTopicCommandRepository topics;
    private final SparringVoteCommandRepository votes;
    private final SparringPostCommandRepository posts;
    private final MemberRepository members;
    private final Clock clock;

    @Transactional
    public SparringCommandResult create(long memberId, CreateSparringCommand command) {
        SparringTopic topic =
                SparringTopic.create(
                        command.title(),
                        command.a(),
                        command.b(),
                        command.description(),
                        member(memberId),
                        LocalDateTime.now(clock));
        return new SparringCommandResult(topics.save(topic).getId());
    }

    @Transactional
    public void vote(long topicId, long memberId, SparringSide side) {
        SparringTopic topic = lock(topicId);
        SparringVote previous = votes.findByTopicIdAndMemberId(topicId, memberId).orElse(null);
        if (previous != null && previous.getSide() == side) return;
        votes.save(
                previous == null
                        ? SparringVote.create(
                                topic, member(memberId), side, LocalDateTime.now(clock))
                        : previous.choosing(side));
        topics.advanceRevision(topicId);
    }

    @Transactional
    public SparringCommandResult post(long topicId, long memberId, PostSparringCommand command) {
        lock(topicId);
        SparringPost previous =
                posts.findByTopicIdAndMemberIdAndRequestId(topicId, memberId, command.requestId())
                        .orElse(null);
        if (previous != null) {
            Long parentId = previous.getReplyTo() == null ? null : previous.getReplyTo().getId();
            if (!previous.getText().equals(command.text().trim())
                    || !Objects.equals(parentId, command.replyToId())) {
                throw new BusinessException(
                        ErrorCode.INVALID_PARAMETER, "같은 전송 번호로 다른 글을 보낼 수 없어요.");
            }
            return new SparringCommandResult(previous.getId());
        }
        SparringVote vote =
                votes.findByTopicIdAndMemberId(topicId, memberId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.SPARRING_VOTE_REQUIRED,
                                                "먼저 내 편을 골라주세요."));
        SparringPost parent =
                command.replyToId() == null
                        ? null
                        : posts.findByIdAndTopicId(command.replyToId(), topicId)
                                .orElseThrow(
                                        () ->
                                                new BusinessException(
                                                        ErrorCode.INVALID_PARAMETER,
                                                        "이 주제의 의견을 골라주세요."));
        SparringPost post =
                posts.save(
                        SparringPost.create(
                                vote,
                                command.text(),
                                parent,
                                command.requestId(),
                                LocalDateTime.now(clock)));
        topics.advanceRevision(topicId);
        return new SparringCommandResult(post.getId());
    }

    private SparringTopic lock(long id) {
        return topics.lockById(id)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.SPARRING_NOT_FOUND, "스파링을 찾을 수 없어요."));
    }

    private Member member(long id) {
        return members.findById(id)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없어요."));
    }
}
