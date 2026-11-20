package com.project.jarihana.minigame.query.controller;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.minigame.domain.MinigameEvent;
import com.project.jarihana.minigame.query.controller.dto.EventStatusResponse;
import com.project.jarihana.minigame.query.controller.dto.RankingResponse;
import com.project.jarihana.minigame.query.service.PeperoDayEventQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PeperoDayEventQueryController {

    private final PeperoDayEventQueryService peperoDayEventQueryService;
    private final LoginMemberReader loginMemberReader;

    @GetMapping("/events/pepero-day")
    public ResponseEntity<ApiResponse<EventStatusResponse>> findEventStatus() {
        EventStatusResponse response = EventStatusResponse.from(
                peperoDayEventQueryService.findStatus(loginMemberReader.currentMemberId().orElse(null))
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/events/pepero-day/rankings")
    public ResponseEntity<ApiResponse<RankingResponse>> findRankings() {
        RankingResponse response = RankingResponse.from(
                peperoDayEventQueryService.findRankings(
                        MinigameEvent.PEPERO_DAY_2026, loginMemberReader.currentMemberId().orElse(null))
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
