package com.project.jarihana.pushsubscription.query.controller;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.pushsubscription.query.controller.dto.PushConfigResponse;
import com.project.jarihana.pushsubscription.query.controller.dto.PushSubscriptionListRequest;
import com.project.jarihana.pushsubscription.query.controller.dto.PushSubscriptionListResponse;
import com.project.jarihana.pushsubscription.query.service.PushSubscriptionQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PushSubscriptionQueryController {
    private final PushSubscriptionQueryService subscriptions;

    @GetMapping("/push-config")
    public ResponseEntity<ApiResponse<PushConfigResponse>> findPushConfig(@LoginMember long memberId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                PushConfigResponse.from(subscriptions.findPushConfig(memberId))));
    }

    @GetMapping("/push-subscriptions")
    public ResponseEntity<ApiResponse<PushSubscriptionListResponse>> findSubscriptions(
            @LoginMember long memberId, @Validated @ModelAttribute PushSubscriptionListRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                PushSubscriptionListResponse.from(subscriptions.findSubscriptions(memberId, request.toQuery()))));
    }
}
