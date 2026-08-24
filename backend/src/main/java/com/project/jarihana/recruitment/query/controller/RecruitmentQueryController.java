package com.project.jarihana.recruitment.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.recruitment.query.controller.dto.RecruitmentDetailResponse;
import com.project.jarihana.recruitment.query.controller.dto.RecruitmentListRequest;
import com.project.jarihana.recruitment.query.controller.dto.RecruitmentListResponse;
import com.project.jarihana.recruitment.query.service.RecruitmentQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/groups/{groupId}/recruitments")
public class RecruitmentQueryController {

    private final RecruitmentQueryService recruitmentQueryService;

    public RecruitmentQueryController(RecruitmentQueryService recruitmentQueryService) {
        this.recruitmentQueryService = recruitmentQueryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<RecruitmentListResponse>> findRecruitments(
            @PathVariable Long groupId,
            @Validated @ModelAttribute RecruitmentListRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                RecruitmentListResponse.from(
                        recruitmentQueryService.findRecruitments(groupId, request.toQuery())
                )
        ));
    }

    @GetMapping("/{recruitmentId}")
    public ResponseEntity<ApiResponse<RecruitmentDetailResponse>> findRecruitment(
            @PathVariable Long groupId,
            @PathVariable Long recruitmentId
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                RecruitmentDetailResponse.from(
                        recruitmentQueryService.findRecruitment(groupId, recruitmentId)
                )
        ));
    }
}
