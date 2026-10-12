package com.project.jarihana.notification.query.controller;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.notification.query.controller.dto.PushContentRequest;
import com.project.jarihana.notification.query.controller.dto.PushContentResponse;
import com.project.jarihana.notification.query.service.PushContentQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PushContentQueryController {
    private final PushContentQueryService content;

    @GetMapping("/notifications/{id}/push-content")
    public ResponseEntity<ApiResponse<PushContentResponse>> findPushContent(@LoginMember long memberId, @PathVariable long id,
            @Validated @ModelAttribute PushContentRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(PushContentResponse.from(content.findPushContent(memberId, id, request.toQuery()))));
    }
}
