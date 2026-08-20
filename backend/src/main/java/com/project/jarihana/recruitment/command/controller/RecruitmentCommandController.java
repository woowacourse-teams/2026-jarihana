package com.project.jarihana.recruitment.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.recruitment.command.controller.dto.CreateRecruitmentRequest;
import com.project.jarihana.recruitment.command.controller.dto.CreateRecruitmentResponse;
import com.project.jarihana.recruitment.command.service.RecruitmentCommandService;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentResult;
import jakarta.validation.Valid;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class RecruitmentCommandController {

    private final RecruitmentCommandService recruitmentCommandService;

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
        URI location = URI.create("/api/groups/%d/recruitments/%d".formatted(response.groupId(), response.id()));
        return ResponseEntity.created(location).body(ApiResponse.success(response));
    }
}
