package com.project.jarihana.registration.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.registration.command.controller.dto.CreateRegistrationRequest;
import com.project.jarihana.registration.command.controller.dto.CreateRegistrationResponse;
import com.project.jarihana.registration.command.controller.dto.DecideRegistrationRequest;
import com.project.jarihana.registration.command.controller.dto.DecideRegistrationResponse;
import com.project.jarihana.registration.command.controller.dto.MarkRegistrationsReadRequest;
import com.project.jarihana.registration.command.service.RegistrationCommandService;
import com.project.jarihana.registration.command.service.RegistrationReadCommandService;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationResult;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationResult;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/recruitments")
@RequiredArgsConstructor
public class RegistrationCommandController {

    private final RegistrationCommandService registrationCommandService;
    private final RegistrationReadCommandService registrationReadCommandService;

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

    @PatchMapping("/{recruitmentId}/registrations/read")
    public ResponseEntity<Void> markRegistrationsRead(
            @LoginMember long memberId,
            @PathVariable long recruitmentId,
            @Valid @RequestBody MarkRegistrationsReadRequest request
    ) {
        registrationReadCommandService.markRegistrationsRead(
                memberId,
                recruitmentId,
                request.throughRegistrationId()
        );
        return ResponseEntity.noContent().build();
    }
}
