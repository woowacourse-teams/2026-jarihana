package com.project.jarihana.groupspace.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupspace.command.controller.dto.SaveGroupSpaceRequest;
import com.project.jarihana.groupspace.command.controller.dto.SaveGroupSpaceResponse;
import com.project.jarihana.groupspace.command.service.GroupSpaceCommandService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/groups/{groupId}/space")
@RequiredArgsConstructor
public class GroupSpaceCommandController {
    private final GroupSpaceCommandService service;

    @PutMapping
    public ResponseEntity<ApiResponse<SaveGroupSpaceResponse>> saveGroupSpace(
            @LoginMember long memberId, @PathVariable long groupId,
            @Valid @RequestBody SaveGroupSpaceRequest request) {
        return ResponseEntity.ok(ApiResponse.success(SaveGroupSpaceResponse.from(service.saveGroupSpace(memberId, groupId, request.toCommand()))));
    }
}
