package com.project.jarihana.activitypost.query.controller;

import com.project.jarihana.activitypost.query.controller.dto.ActivityPostListRequest;
import com.project.jarihana.activitypost.query.controller.dto.ActivityPostListResponse;
import com.project.jarihana.activitypost.query.service.ActivityPostQueryService;
import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ActivityPostQueryController {

    private final ActivityPostQueryService activityPostQueryService;
    private final LoginMemberReader loginMemberReader;

    public ActivityPostQueryController(
            ActivityPostQueryService activityPostQueryService,
            LoginMemberReader loginMemberReader
    ) {
        this.activityPostQueryService = activityPostQueryService;
        this.loginMemberReader = loginMemberReader;
    }

    @GetMapping("/activity-posts")
    public ResponseEntity<ApiResponse<ActivityPostListResponse>> findAll(
            @Valid @ModelAttribute ActivityPostListRequest request
    ) {
        ActivityPostListResponse response = ActivityPostListResponse.from(
                activityPostQueryService.find(null, request.toQuery(), loginMemberReader.currentMemberId().orElse(null))
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/groups/{groupId}/activity-posts")
    public ResponseEntity<ApiResponse<ActivityPostListResponse>> findByGroup(
            @PathVariable long groupId,
            @Valid @ModelAttribute ActivityPostListRequest request
    ) {
        ActivityPostListResponse response = ActivityPostListResponse.from(
                activityPostQueryService.find(
                        groupId,
                        request.toQuery(),
                        loginMemberReader.currentMemberId().orElse(null)
                )
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
