package com.project.jarihana.registration.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.registration.command.controller.dto.CreateRegistrationRequest;
import com.project.jarihana.registration.command.controller.dto.CreateRegistrationResponse;
import com.project.jarihana.registration.command.controller.dto.DecideRegistrationRequest;
import com.project.jarihana.registration.command.controller.dto.DecideRegistrationResponse;
import com.project.jarihana.registration.command.service.RegistrationCommandService;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationResult;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationResult;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recruitments")
@RequiredArgsConstructor
public class RegistrationCommandController {

    private final RegistrationCommandService registrationCommandService;

    @DeleteMapping("/{recruitmentId}/registrations/{registrationId}")
    public ResponseEntity<Void> withdrawRegistration(
            @LoginMember long memberId,
            @PathVariable long recruitmentId,
            @PathVariable long registrationId
    ) {
        registrationCommandService.withdrawRegistration(memberId, recruitmentId, registrationId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{recruitmentId}/registrations")
    public ResponseEntity<ApiResponse<CreateRegistrationResponse>> createRegistration(
            @LoginMember long memberId,
            @PathVariable long recruitmentId,
            @Valid @RequestBody CreateRegistrationRequest request
    ) {
        CreateRegistrationResult result = registrationCommandService.createRegistration(
                memberId,
                recruitmentId,
                request.toCommand()
        );
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(CreateRegistrationResponse.from(result)));
    }

    @PatchMapping("/{recruitmentId}/registrations/{registrationId}")
    public ResponseEntity<ApiResponse<DecideRegistrationResponse>> decideRegistration(
            @LoginMember long memberId,
            @PathVariable long recruitmentId,
            @PathVariable long registrationId,
            @Valid @RequestBody DecideRegistrationRequest request
    ) {
        DecideRegistrationResult result = registrationCommandService.decideRegistration(
                memberId,
                recruitmentId,
                registrationId,
                request.toCommand()
        );
        return ResponseEntity.ok(ApiResponse.success(DecideRegistrationResponse.from(result)));
    }
}
