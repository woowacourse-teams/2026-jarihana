package com.project.jarihana.member.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.member.query.controller.dto.MemberAvatarResponse;
import com.project.jarihana.member.query.service.MemberAvatarQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/members/me/avatar")
@RequiredArgsConstructor
public class MemberAvatarQueryController {
    private final MemberAvatarQueryService service;

    @GetMapping
    public ResponseEntity<ApiResponse<MemberAvatarResponse>> findMyAvatar(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(MemberAvatarResponse.from(service.findMyAvatar(memberId))));
    }
}
