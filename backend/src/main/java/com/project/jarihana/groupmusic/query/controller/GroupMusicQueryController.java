package com.project.jarihana.groupmusic.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupmusic.query.controller.dto.GroupMusicResponse;
import com.project.jarihana.groupmusic.query.service.GroupMusicQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/groups/{groupId}/music")
@RequiredArgsConstructor
public class GroupMusicQueryController {
    private final GroupMusicQueryService service;

    @GetMapping
    public ResponseEntity<ApiResponse<GroupMusicResponse>> findGroupMusic(@PathVariable long groupId) {
        return ResponseEntity.ok(ApiResponse.success(GroupMusicResponse.from(service.findGroupMusic(groupId))));
    }
}
