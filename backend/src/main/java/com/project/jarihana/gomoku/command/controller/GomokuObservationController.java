package com.project.jarihana.gomoku.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.gomoku.command.controller.dto.GomokuObservationRequest;
import com.project.jarihana.gomoku.command.controller.dto.GomokuObservationResponse;
import com.project.jarihana.gomoku.command.service.GomokuObservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class GomokuObservationController {
    private final GomokuObservationService observations;

    @PostMapping("/games/gomoku/rooms/{id}/observations")
    public ResponseEntity<ApiResponse<GomokuObservationResponse>> enterObservation(
            @PathVariable long id, @LoginMember long memberId, @Valid @RequestBody GomokuObservationRequest request) {
        var result = observations.enter(id, memberId, request.requestId());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .header("Cache-Control", "no-store")
                .body(ApiResponse.success(GomokuObservationResponse.from(result)));
    }

    @DeleteMapping("/games/gomoku/rooms/{id}/observations/{participationId}")
    public ResponseEntity<Void> leaveObservation(@PathVariable long id, @PathVariable UUID participationId,
            @LoginMember long memberId) {
        observations.leave(id, memberId, participationId);
        return ResponseEntity.noContent().build();
    }
}
