package com.project.jarihana.member.query.controller;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.auth.SignupSession;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.member.query.controller.dto.MyProfileResponse;
import com.project.jarihana.member.query.service.MemberQueryService;
import com.project.jarihana.member.query.service.dto.MyProfileQuery;
import com.project.jarihana.member.query.service.dto.MyProfileResult;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/members")
public class MemberQueryController {

    private final MemberQueryService memberQueryService;
    private final LoginMemberReader loginMemberReader;
    private final SignupSession signupSession;

    public MemberQueryController(
            MemberQueryService memberQueryService,
            LoginMemberReader loginMemberReader,
            SignupSession signupSession
    ) {
        this.memberQueryService = memberQueryService;
        this.loginMemberReader = loginMemberReader;
        this.signupSession = signupSession;
    }

    /**
     * 자격 증명이 Access Token과 가입 세션 두 갈래여서 LoginMember 어노테이션을 쓰지 않는다.
     * 어느 쪽도 없을 때 거부하는 판단은 Service가 한다.
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<MyProfileResponse>> findMyProfile(HttpServletRequest request) {
        MyProfileQuery query = new MyProfileQuery(
                loginMemberReader.currentMemberId().orElse(null),
                signupSession.githubId(request).orElse(null)
        );
        MyProfileResult result = memberQueryService.findMyProfile(query);
        return ResponseEntity.ok(ApiResponse.success(MyProfileResponse.from(result)));
    }
}
