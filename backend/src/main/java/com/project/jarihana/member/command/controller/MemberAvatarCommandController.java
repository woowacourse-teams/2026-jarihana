package com.project.jarihana.member.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.member.command.controller.dto.CustomizeAvatarRequest;
import com.project.jarihana.member.command.service.MemberAvatarCommandService;
import com.project.jarihana.member.domain.AvatarAppearance;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/members/me/avatar")
@RequiredArgsConstructor
public class MemberAvatarCommandController {
    private final MemberAvatarCommandService service;

    @PutMapping
    public ResponseEntity<Void> customizeMyAvatar(
            @LoginMember long memberId, @Valid @RequestBody CustomizeAvatarRequest request) {
        AvatarAppearance appearance = request.appearance().toAppearance();
        service.customizeMyAvatar(memberId, appearance);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> removeMyAvatar(@LoginMember long memberId) {
        service.resetMyAvatar(memberId);
        return ResponseEntity.noContent().build();
    }
}
