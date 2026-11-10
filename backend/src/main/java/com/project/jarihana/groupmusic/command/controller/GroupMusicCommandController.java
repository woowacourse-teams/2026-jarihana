package com.project.jarihana.groupmusic.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.groupmusic.command.controller.dto.AddMusicQueueRequest;
import com.project.jarihana.groupmusic.command.controller.dto.SkipMusicQueueRequest;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupmusic.command.controller.dto.SaveGroupMusicRequest;
import com.project.jarihana.groupmusic.command.controller.dto.SaveGroupMusicResponse;
import com.project.jarihana.groupmusic.command.service.GroupMusicCommandService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import com.project.jarihana.groupmusic.command.controller.dto.ControlPlaybackRequest;
import com.project.jarihana.groupmusic.command.controller.dto.AdvancePlaybackRequest;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/groups/{groupId}/music")
@RequiredArgsConstructor
public class GroupMusicCommandController {
    private final GroupMusicCommandService service;

    @PostMapping("/queue")
    public ResponseEntity<ApiResponse<SaveGroupMusicResponse>> addToQueue(
            @LoginMember long memberId, @PathVariable long groupId,
            @Valid @RequestBody AddMusicQueueRequest request) {
        return ResponseEntity.ok(ApiResponse.success(SaveGroupMusicResponse.from(service.addToQueue(memberId, groupId, request.toCommand()))));
    }

    @PostMapping("/queue/skip")
    public ResponseEntity<ApiResponse<SaveGroupMusicResponse>> skipQueue(
            @LoginMember long memberId, @PathVariable long groupId,
            @Valid @RequestBody SkipMusicQueueRequest request) {
        return ResponseEntity.ok(ApiResponse.success(SaveGroupMusicResponse.from(service.skipQueue(memberId, groupId, request.expectedRevision()))));
    }

    @PutMapping
    public ResponseEntity<ApiResponse<SaveGroupMusicResponse>> saveGroupMusic(
            @LoginMember long memberId, @PathVariable long groupId,
            @Valid @RequestBody SaveGroupMusicRequest request) {
        return ResponseEntity.ok(ApiResponse.success(SaveGroupMusicResponse.from(service.saveGroupMusic(memberId, groupId, request.toCommand()))));
    }

    @PutMapping("/playback")
    public ResponseEntity<ApiResponse<SaveGroupMusicResponse>> controlPlayback(
            @LoginMember long memberId, @PathVariable long groupId,
            @Valid @RequestBody ControlPlaybackRequest request) {
        return ResponseEntity.ok(ApiResponse.success(SaveGroupMusicResponse.from(service.controlPlayback(memberId, groupId, request.toCommand()))));
    }

    @PostMapping("/playback/advance")
    public ResponseEntity<ApiResponse<SaveGroupMusicResponse>> advancePlayback(
            @LoginMember long memberId, @PathVariable long groupId,
            @Valid @RequestBody AdvancePlaybackRequest request) {
        return ResponseEntity.ok(ApiResponse.success(SaveGroupMusicResponse.from(service.advancePlayback(memberId, groupId, request.toCommand()))));
    }

}
