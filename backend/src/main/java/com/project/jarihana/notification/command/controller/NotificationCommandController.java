package com.project.jarihana.notification.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.notification.command.controller.dto.NotificationReadAllResponse;
import com.project.jarihana.notification.command.controller.dto.NotificationReadResponse;
import com.project.jarihana.notification.command.service.NotificationCommandService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationCommandController {

    private final NotificationCommandService notifications;

    @PatchMapping("/{id}/read")
    public ResponseEntity<ApiResponse<NotificationReadResponse>> readNotification(@LoginMember long memberId, @PathVariable long id) {
        return ResponseEntity.ok(ApiResponse.success(NotificationReadResponse.from(notifications.readNotification(memberId, id))));
    }

    @PatchMapping("/read-all")
    public ResponseEntity<ApiResponse<NotificationReadAllResponse>> readAllNotifications(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(NotificationReadAllResponse.from(notifications.readAllNotifications(memberId))));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNotification(@LoginMember long memberId, @PathVariable long id) {
        notifications.deleteNotification(memberId, id);
        return ResponseEntity.noContent().build();
    }
}
