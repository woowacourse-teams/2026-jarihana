package com.project.jarihana.recruitment.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.recruitment.command.controller.dto.CloseRecruitmentRequest;
import com.project.jarihana.recruitment.command.controller.dto.CloseRecruitmentResponse;
import com.project.jarihana.recruitment.command.controller.dto.CreateRecruitmentRequest;
import com.project.jarihana.recruitment.command.controller.dto.CreateRecruitmentResponse;
import com.project.jarihana.recruitment.command.service.RecruitmentCommandService;
import com.project.jarihana.recruitment.command.service.dto.CloseRecruitmentResult;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentResult;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

@RestController
@RequestMapping("/groups")
@RequiredArgsConstructor
public class RecruitmentCommandController {

    private final RecruitmentCommandService recruitmentCommandService;

    @PatchMapping("/{groupId}/recruitments/{recruitmentId}")
    public ResponseEntity<ApiResponse<CloseRecruitmentResponse>> closeRecruitment(
            @LoginMember long memberId,
            @PathVariable long groupId,
            @PathVariable long recruitmentId,
            @Valid @RequestBody CloseRecruitmentRequest request
    ) {
        CloseRecruitmentResult result = recruitmentCommandService.closeRecruitment(
                memberId,
                groupId,
                recruitmentId
        );
        return ResponseEntity.ok(ApiResponse.success(CloseRecruitmentResponse.from(result)));
    }

    @PostMapping("/{groupId}/recruitments")
    public ResponseEntity<ApiResponse<CreateRecruitmentResponse>> createRecruitment(
            @LoginMember long memberId,
            @PathVariable long groupId,
            @Valid @RequestBody CreateRecruitmentRequest request
    ) {
        CreateRecruitmentResult result = recruitmentCommandService.createRecruitment(
                memberId,
                groupId,
                request.toCommand()
        );
        CreateRecruitmentResponse response = CreateRecruitmentResponse.from(result);
        URI location = URI.create("/groups/%d/recruitments/%d".formatted(response.groupId(), response.id()));
        return ResponseEntity.created(location).body(ApiResponse.success(response));
    }
}
