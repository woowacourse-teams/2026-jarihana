package com.project.jarihana.minigame.query.controller;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.minigame.domain.MinigameEvent;
import com.project.jarihana.minigame.query.controller.dto.RankingResponse;
import com.project.jarihana.minigame.query.service.PeperoDayEventQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 게임방 반띵 순위다. 이벤트 순위와 같은 규칙으로 매기고 게임방에서 한 판만 센다.
 */
@RestController
@RequiredArgsConstructor
public class StickHalvingRoomQueryController {

    private final PeperoDayEventQueryService peperoDayEventQueryService;
    private final LoginMemberReader loginMemberReader;

    @GetMapping("/games/stick-halving/rankings")
    public ResponseEntity<ApiResponse<RankingResponse>> findRankings() {
        RankingResponse response = RankingResponse.from(
                peperoDayEventQueryService.findRankings(
                        MinigameEvent.STICK_HALVING_ROOM, loginMemberReader.currentMemberId().orElse(null))
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
