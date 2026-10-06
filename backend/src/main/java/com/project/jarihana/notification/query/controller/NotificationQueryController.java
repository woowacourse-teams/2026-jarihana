package com.project.jarihana.notification.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.notification.query.controller.dto.NotificationItemResponse;
import com.project.jarihana.notification.query.controller.dto.NotificationListRequest;
import com.project.jarihana.notification.query.controller.dto.NotificationListResponse;
import com.project.jarihana.notification.query.controller.dto.NotificationUnreadCountResponse;
import com.project.jarihana.notification.query.service.NotificationQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationQueryController {

    private final NotificationQueryService notifications;

    @GetMapping
    public ResponseEntity<ApiResponse<NotificationListResponse>> findNotifications(
            @LoginMember long memberId, @Validated @ModelAttribute NotificationListRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                NotificationListResponse.from(notifications.findNotifications(memberId, request.toQuery()))));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<NotificationItemResponse>> findNotification(
            @LoginMember long memberId, @PathVariable long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                NotificationItemResponse.from(notifications.findNotification(memberId, id))));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<NotificationUnreadCountResponse>> countUnreadNotifications(@LoginMember long memberId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                new NotificationUnreadCountResponse(notifications.countUnreadNotifications(memberId))));
    }
}
