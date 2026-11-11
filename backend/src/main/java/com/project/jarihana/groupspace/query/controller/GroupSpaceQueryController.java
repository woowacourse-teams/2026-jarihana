package com.project.jarihana.groupspace.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupspace.query.controller.dto.GroupSpaceResponse;
import com.project.jarihana.groupspace.query.service.GroupSpaceQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/groups/{groupId}/space")
@RequiredArgsConstructor
public class GroupSpaceQueryController {
    private final GroupSpaceQueryService service;

    @GetMapping
    public ResponseEntity<ApiResponse<GroupSpaceResponse>> findGroupSpace(@PathVariable long groupId) {
        return ResponseEntity.ok(ApiResponse.success(GroupSpaceResponse.from(service.findGroupSpace(groupId))));
    }
}
