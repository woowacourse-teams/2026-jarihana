package com.project.jarihana.minigame.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.minigame.command.controller.dto.CutRequest;
import com.project.jarihana.minigame.command.controller.dto.CutResponse;
import com.project.jarihana.minigame.command.controller.dto.IssueRoundRequest;
import com.project.jarihana.minigame.command.controller.dto.StartRunResponse;
import com.project.jarihana.minigame.command.service.PeperoDayRunCommandService;
import com.project.jarihana.minigame.domain.MinigameEvent;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 게임방으로 옮긴 반띵의 순위 도전이다. 이벤트와 같은 판정을 쓰고 기록은 게임방 순위표에 남긴다.
 */
@RestController
@RequiredArgsConstructor
public class StickHalvingRoomCommandController {

    private final PeperoDayRunCommandService peperoDayRunCommandService;

    @PostMapping("/games/stick-halving/runs")
    public ResponseEntity<ApiResponse<StartRunResponse>> startRun(@LoginMember long memberId) {
        StartRunResponse response = StartRunResponse.from(peperoDayRunCommandService.startInGameRoom(memberId));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @PostMapping("/games/stick-halving/runs/{runId}/rounds")
    public ResponseEntity<ApiResponse<StartRunResponse>> issueRound(
            @LoginMember long memberId,
            @PathVariable long runId,
            @Valid @RequestBody IssueRoundRequest request
    ) {
        StartRunResponse response = StartRunResponse.from(
                peperoDayRunCommandService.issueRound(request.toCommand(MinigameEvent.STICK_HALVING_ROOM, memberId, runId))
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/games/stick-halving/runs/{runId}/cuts")
    public ResponseEntity<ApiResponse<CutResponse>> cutStick(
            @LoginMember long memberId,
            @PathVariable long runId,
            @Valid @RequestBody CutRequest request
    ) {
        CutResponse response = CutResponse.from(
                peperoDayRunCommandService.cut(request.toCommand(MinigameEvent.STICK_HALVING_ROOM, memberId, runId))
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
