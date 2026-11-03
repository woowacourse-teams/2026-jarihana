package com.project.jarihana.minigame.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.minigame.command.controller.dto.CutRequest;
import com.project.jarihana.minigame.command.controller.dto.CutResponse;
import com.project.jarihana.minigame.command.controller.dto.StartRunResponse;
import com.project.jarihana.minigame.command.service.PeperoDayRunCommandService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PeperoDayRunCommandController {

    private final PeperoDayRunCommandService peperoDayRunCommandService;

    @PostMapping("/events/pepero-day/runs")
    public ResponseEntity<ApiResponse<StartRunResponse>> startRun(@LoginMember long memberId) {
        StartRunResponse response = StartRunResponse.from(peperoDayRunCommandService.start(memberId));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @PostMapping("/events/pepero-day/runs/{runId}/cuts")
    public ResponseEntity<ApiResponse<CutResponse>> cutStick(
            @LoginMember long memberId,
            @PathVariable long runId,
            @Valid @RequestBody CutRequest request
    ) {
        CutResponse response = CutResponse.from(peperoDayRunCommandService.cut(request.toCommand(memberId, runId)));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
