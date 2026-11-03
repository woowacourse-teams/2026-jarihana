package com.project.jarihana.minigame.query.service.dto;

import java.util.List;

/**
 * 내 순위는 로그인 회원이 끝낸 판이 있을 때만 있다.
 */
public record RankingResult(List<Entry> items, Entry me) {

    public RankingResult {
        items = List.copyOf(items);
    }

    public record Entry(long rank, String nickname, int totalScore, long totalDurationMillis) {
    }
}
