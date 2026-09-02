package com.project.jarihana.member.command.controller;

import com.project.jarihana.auth.cookie.AuthCookieFactory;
import com.project.jarihana.auth.session.SignupSession;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.member.command.controller.dto.MemberSignupRequest;
import com.project.jarihana.member.command.controller.dto.MemberSignupResponse;
import com.project.jarihana.member.command.service.MemberCommandService;
import com.project.jarihana.member.command.service.dto.MemberSignupCommand;
import com.project.jarihana.member.command.service.dto.MemberSignupResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/members")
public class MemberCommandController {

    private static final String MEMBER_LOCATION_PREFIX = "/members/";

    private final MemberCommandService memberCommandService;
    private final SignupSession signupSession;
    private final AuthCookieFactory authCookieFactory;

    public MemberCommandController(
            MemberCommandService memberCommandService,
            SignupSession signupSession,
            AuthCookieFactory authCookieFactory
    ) {
        this.memberCommandService = memberCommandService;
        this.signupSession = signupSession;
        this.authCookieFactory = authCookieFactory;
    }

    /**
     * {@code githubId}는 Request Body가 아니라 가입 세션에서 읽는다. 가입을 마치면 세션을
     * 무효화하고, 이후 API에서 쓸 Access Token과 Refresh Token을 쿠키로 내린다.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<MemberSignupResponse>> signup(
            @Valid @RequestBody MemberSignupRequest request,
            HttpServletRequest servletRequest
    ) {
        MemberSignupCommand command = new MemberSignupCommand(
                signupSession.githubId(servletRequest).orElse(null),
                request.crewName(),
                request.generation(),
                request.course()
        );
        MemberSignupResult result = memberCommandService.signup(command);
        signupSession.invalidate(servletRequest);

        return ResponseEntity.created(URI.create(MEMBER_LOCATION_PREFIX + result.id()))
                .header(HttpHeaders.SET_COOKIE, authCookieFactory.accessToken(result.accessToken()).toString())
                .header(HttpHeaders.SET_COOKIE, authCookieFactory.refreshToken(result.refreshToken()).toString())
                .body(ApiResponse.success(MemberSignupResponse.from(result)));
    }
}
