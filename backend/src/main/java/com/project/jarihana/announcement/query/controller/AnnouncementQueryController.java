package com.project.jarihana.announcement.query.controller;

import com.project.jarihana.announcement.query.controller.dto.AnnouncementDetailResponse;
import com.project.jarihana.announcement.query.controller.dto.AnnouncementListRequest;
import com.project.jarihana.announcement.query.controller.dto.AnnouncementListResponse;
import com.project.jarihana.announcement.query.service.AnnouncementQueryService;
import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AnnouncementQueryController {

    private final AnnouncementQueryService announcements;
    private final LoginMemberReader loginMemberReader;

    public AnnouncementQueryController(AnnouncementQueryService announcements, LoginMemberReader loginMemberReader) {
        this.announcements = announcements;
        this.loginMemberReader = loginMemberReader;
    }

    @GetMapping("/groups/{groupId}/announcements")
    public ResponseEntity<ApiResponse<AnnouncementListResponse>> findByGroup(
            @PathVariable long groupId,
            @Valid @ModelAttribute AnnouncementListRequest request
    ) {
        AnnouncementListResponse response = AnnouncementListResponse.from(announcements.findByGroup(
                groupId, request.toQuery(), loginMemberReader.currentMemberId().orElse(null)
        ));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(response));
    }

    @GetMapping("/groups/{groupId}/announcements/{announcementId}")
    public ResponseEntity<ApiResponse<AnnouncementDetailResponse>> findDetail(
            @PathVariable long groupId,
            @PathVariable long announcementId
    ) {
        AnnouncementDetailResponse response = AnnouncementDetailResponse.from(announcements.findDetail(
                groupId, announcementId, loginMemberReader.currentMemberId().orElse(null)
        ));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(response));
    }
}
