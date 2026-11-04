package com.project.jarihana.announcement.command.controller;

import com.project.jarihana.announcement.command.controller.dto.AnnouncementCreatedResponse;
import com.project.jarihana.announcement.command.controller.dto.CreateAnnouncementRequest;
import com.project.jarihana.announcement.command.controller.dto.ModifyAnnouncementRequest;
import com.project.jarihana.announcement.command.service.AnnouncementCommandService;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AnnouncementCommandController {

    private final AnnouncementCommandService announcements;

    public AnnouncementCommandController(AnnouncementCommandService announcements) {
        this.announcements = announcements;
    }

    @PostMapping("/groups/{groupId}/announcements")
    public ResponseEntity<ApiResponse<AnnouncementCreatedResponse>> create(
            @LoginMember Long memberId,
            @PathVariable long groupId,
            @Valid @RequestBody CreateAnnouncementRequest request
    ) {
        AnnouncementCreatedResponse response = AnnouncementCreatedResponse.from(
                announcements.create(memberId, groupId, request.toCommand())
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @PutMapping("/groups/{groupId}/announcements/{announcementId}")
    public ResponseEntity<ApiResponse<Void>> modify(
            @LoginMember Long memberId,
            @PathVariable long groupId,
            @PathVariable long announcementId,
            @Valid @RequestBody ModifyAnnouncementRequest request
    ) {
        announcements.modify(memberId, groupId, announcementId, request.toCommand());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @DeleteMapping("/groups/{groupId}/announcements/{announcementId}")
    public ResponseEntity<Void> delete(
            @LoginMember Long memberId,
            @PathVariable long groupId,
            @PathVariable long announcementId
    ) {
        announcements.delete(memberId, groupId, announcementId);
        return ResponseEntity.noContent().build();
    }
}
