package com.project.jarihana.registration.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.registration.query.controller.dto.RegistrationListRequest;
import com.project.jarihana.registration.query.controller.dto.RegistrationListResponse;
import com.project.jarihana.registration.query.service.RegistrationQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recruitments/{recruitmentId}/registrations")
public class RegistrationQueryController {

    private final RegistrationQueryService registrationQueryService;

    public RegistrationQueryController(RegistrationQueryService registrationQueryService) {
        this.registrationQueryService = registrationQueryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<RegistrationListResponse>> findRegistrations(
            @PathVariable Long recruitmentId,
            @LoginMember Long memberId,
            @Validated @ModelAttribute RegistrationListRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                RegistrationListResponse.from(
                        registrationQueryService.findRegistrations(
                                memberId,
                                recruitmentId,
                                request.toQuery()
                        )
                )
        ));
    }
}
