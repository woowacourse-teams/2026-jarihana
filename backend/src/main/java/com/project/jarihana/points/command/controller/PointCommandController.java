package com.project.jarihana.points.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.points.command.service.PointRewardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/members/me/points")
@RequiredArgsConstructor
public class PointCommandController {
    private final PointRewardService rewards;

    @PostMapping("/first-join-claim")
    public ResponseEntity<ApiResponse<ClaimResponse>> claimFirstJoin(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(new ClaimResponse(rewards.claimFirstJoin(memberId))));
    }

    public record ClaimResponse(boolean queued) {
    }
}
