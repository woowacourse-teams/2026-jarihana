package com.project.jarihana.auth.command.controller;

import com.project.jarihana.auth.command.controller.dto.RealtimeJoinTokenResponse;
import com.project.jarihana.auth.command.service.RealtimeJoinTokenService;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class RealtimeJoinTokenController {
    private final RealtimeJoinTokenService service;

    @PostMapping("/groups/{groupId}/space/join-token")
    public ResponseEntity<ApiResponse<RealtimeJoinTokenResponse>> issueJoinToken(
            @LoginMember long memberId, @PathVariable long groupId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                RealtimeJoinTokenResponse.from(service.issueJoinToken(memberId, groupId))));
    }
}
