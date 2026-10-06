package com.project.jarihana.pushsubscription.command.controller;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.pushsubscription.command.controller.dto.PushSubscriptionRequest;
import com.project.jarihana.pushsubscription.command.controller.dto.PushSubscriptionResponse;
import com.project.jarihana.pushsubscription.command.service.PushSubscriptionCommandService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/push-subscriptions")
@RequiredArgsConstructor
public class PushSubscriptionCommandController {
    private final PushSubscriptionCommandService subscriptions;

    @PostMapping
    public ResponseEntity<ApiResponse<PushSubscriptionResponse>> registerSubscription(
            @LoginMember long memberId, @Valid @RequestBody PushSubscriptionRequest request) {
        var result = subscriptions.registerSubscription(memberId, request.toCommand());
        return ResponseEntity.status(result.created() ? 201 : 200).body(ApiResponse.success(PushSubscriptionResponse.from(result)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> disconnectSubscription(@LoginMember long memberId, @PathVariable long id) {
        subscriptions.disconnectSubscription(memberId, id);
        return ResponseEntity.noContent().build();
    }
}
