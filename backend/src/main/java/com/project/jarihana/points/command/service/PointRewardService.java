package com.project.jarihana.points.command.service;

import com.project.jarihana.points.command.repository.PointCommandRepository.GroupOrigin;
import com.project.jarihana.points.command.repository.PointCommandRepository;
import com.project.jarihana.points.config.PointPolicy;
import com.project.jarihana.points.config.PointRewardRules;
import com.project.jarihana.points.domain.PointReward.SkipReason;
import com.project.jarihana.points.domain.PointReward;
import com.project.jarihana.points.domain.PointRewardRule;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static com.project.jarihana.points.config.PointRewardRules.ACTIVITY_POST;
import static com.project.jarihana.points.config.PointRewardRules.FIRST_GROUP_JOIN;
import static com.project.jarihana.points.config.PointRewardRules.GOMOKU_WIN;
import static com.project.jarihana.points.config.PointRewardRules.GROUP_CREATED;
import static com.project.jarihana.points.config.PointRewardRules.GROUP_FIRST_MEMBER;
import static com.project.jarihana.points.config.PointRewardRules.MEMBER_SIGNUP;

@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class PointRewardService {
    private final PointCommandRepository repository;
    private final PointPolicy policy;
    private final PointRewardRules rules;
    private final Clock clock;

    public void register(PointReward reward) {
        registerAll(List.of(reward));
    }

    public void registerAll(List<PointReward> rewards) {
        rewards.forEach(reward -> rules.requireRegistered(reward.rule()));
        List<PointReward> active = rewards.stream()
                .filter(reward -> policy.isActiveAt(reward.occurredAt()))
                .toList();
        active.stream().mapToLong(PointReward::memberId).distinct().sorted().forEach(repository::lockWallet);
        active.forEach(this::recordLocked);
    }

    public void memberSignedUp(long memberId) {
        register(signupReward(memberId, LocalDateTime.now(clock)));
    }

    public void backfillSignupRewards(LocalDateTime occurredAt, int limit) {
        List<PointReward> missingRewards = repository.findMembersWithoutAward(MEMBER_SIGNUP.code(), limit).stream()
                .map(memberId -> signupReward(memberId, occurredAt))
                .toList();
        registerAll(missingRewards);
    }

    private static PointReward signupReward(long memberId, LocalDateTime occurredAt) {
        return PointReward.of(MEMBER_SIGNUP, memberId, "member:" + memberId, occurredAt);
    }

    public void groupCreated(long groupId, long creatorId, LocalDateTime occurredAt) {
        repository.recordGroupOrigin(groupId, creatorId, occurredAt);
        register(PointReward.of(GROUP_CREATED, creatorId, "group:" + groupId, occurredAt));
    }

    public void groupJoined(long groupId, long membershipId, long memberId, LocalDateTime occurredAt) {
        if (!policy.isActiveAt(occurredAt)) {
            return;
        }
        GroupOrigin origin = repository.findGroupOrigin(groupId).orElse(null);
        if (origin != null && origin.creatorMemberId() == memberId) {
            return;
        }

        PointReward joined = PointReward.of(FIRST_GROUP_JOIN, memberId, "membership:" + membershipId, occurredAt);
        if (origin == null || !policy.isActiveAt(origin.createdAt())) {
            register(joined);
            return;
        }
        PointReward firstMember = PointReward.of(GROUP_FIRST_MEMBER, origin.creatorMemberId(), "group:" + groupId, occurredAt);
        registerAll(List.of(firstMember, joined));
    }

    public void activityPublished(long postId, long groupId, long memberId, LocalDate activityDate,
                                  LocalDateTime occurredAt) {
        register(PointReward.of(ACTIVITY_POST, memberId, "post:" + postId, groupId + ":" + activityDate, occurredAt, null));
    }

    public void gomokuWon(long gameId, long winnerId, boolean playedEnough, LocalDateTime occurredAt) {
        register(PointReward.of(GOMOKU_WIN, winnerId, "game:" + gameId, null, occurredAt,
                playedEnough ? null : SkipReason.TOO_FEW_MOVES));
    }

    @Transactional
    public boolean claimFirstJoin(long memberId) {
        LocalDateTime now = LocalDateTime.now(clock);
        if (!policy.isActiveAt(now) || !repository.hasOlderMembership(memberId, policy.startsAt())) {
            return false;
        }
        repository.lockWallet(memberId);
        if (repository.hasAward(memberId, FIRST_GROUP_JOIN.code())) {
            return false;
        }
        recordLocked(PointReward.of(FIRST_GROUP_JOIN, memberId, "legacy:" + memberId, now));
        return true;
    }

    private void recordLocked(PointReward reward) {
        if (repository.hasSource(reward)) {
            return;
        }
        repository.record(reward, exclusion(reward), LocalDateTime.now(clock));
    }

    private SkipReason exclusion(PointReward reward) {
        if (reward.ineligibleReason() != null) {
            return reward.ineligibleReason();
        }
        PointRewardRule rule = reward.rule();
        if (rule.oncePerMember() && repository.hasAward(reward.memberId(), rule.code())) {
            return SkipReason.ALREADY_REWARDED;
        }
        if (rule.duplicateScopeReason() != null && repository.hasScope(reward)) {
            return rule.duplicateScopeReason();
        }
        if (rule.weeklyLimit() > 0) {
            LocalDateTime start = PointPolicy.weekStart(reward.occurredAt());
            if (repository.countDuring(reward, start, start.plusWeeks(1)) >= rule.weeklyLimit()) {
                return SkipReason.WEEKLY_LIMIT;
            }
        }
        return null;
    }
}
