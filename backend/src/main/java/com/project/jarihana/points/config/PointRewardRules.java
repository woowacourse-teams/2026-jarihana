package com.project.jarihana.points.config;

import com.project.jarihana.points.domain.PointReward.SkipReason;
import com.project.jarihana.points.domain.PointRewardRule;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Component
public class PointRewardRules {
    public static final PointRewardRule MEMBER_SIGNUP = PointRewardRule.once("MEMBER_SIGNUP", "서비스 가입", 200);
    public static final PointRewardRule GROUP_CREATED = PointRewardRule.weekly("GROUP_CREATED", "모임 만들기", 200, 2);
    public static final PointRewardRule GROUP_FIRST_MEMBER =
            PointRewardRule.once("GROUP_FIRST_MEMBER", "만든 모임에 첫 구성원 합류", 400);
    public static final PointRewardRule FIRST_GROUP_JOIN =
            PointRewardRule.once("FIRST_GROUP_JOIN", "첫 모임 합류", 150);
    public static final PointRewardRule GOMOKU_WIN = PointRewardRule.weekly("GOMOKU_WIN", "오목 승리", 50, 3);
    public static final PointRewardRule ACTIVITY_POST =
            new PointRewardRule("ACTIVITY_POST", "사진 활동기록", 150, false, 2, SkipReason.SAME_ACTIVITY_DATE);

    private final Map<String, PointRewardRule> byCode;
    private final List<PointRewardRule> weekly;

    public PointRewardRules(List<PointRewardRule> extensions) {
        List<PointRewardRule> all = Stream.concat(
                Stream.of(MEMBER_SIGNUP, GROUP_CREATED, GROUP_FIRST_MEMBER, FIRST_GROUP_JOIN, GOMOKU_WIN, ACTIVITY_POST),
                extensions.stream().sorted(Comparator.comparing(PointRewardRule::code))
        ).toList();
        byCode = all.stream().collect(Collectors.toUnmodifiableMap(PointRewardRule::code, Function.identity()));
        weekly = all.stream().filter(rule -> rule.weeklyLimit() > 0).toList();
    }

    public void requireRegistered(PointRewardRule rule) {
        if (!rule.equals(byCode.get(rule.code()))) {
            throw new IllegalArgumentException("등록된 포인트 적립 규칙이 아닙니다: " + rule.code());
        }
    }

    public List<PointRewardRule> weekly() {
        return weekly;
    }

    public Optional<String> findLabel(String code) {
        return Optional.ofNullable(byCode.get(code)).map(PointRewardRule::label);
    }
}
