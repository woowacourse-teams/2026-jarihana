package com.project.jarihana.rhythmbattle.stream;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.cookie.AuthCookieReader;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequiredArgsConstructor
public class RhythmBattleStreamController {
    private final RhythmBattleStreams streams;
    private final AccessTokenProvider tokens;
    private final AuthCookieProperties cookies;

    /**
     * 연결은 로그인 토큰이 만료되기 전까지만 유지하고, 클라이언트는 끊기면 다시 연결한다.
     */
    @GetMapping(value = "/games/rhythm-battle/rooms/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> subscribe(
            @PathVariable long id, @LoginMember long memberId, HttpServletRequest request) {
        String raw = AuthCookieReader.read(request, cookies.accessTokenName())
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "로그인 후 참가해 주세요."));
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store, no-transform")
                .header("X-Accel-Buffering", "no")
                .body(streams.subscribe(id, memberId, tokens.parseExpiresAt(raw).toEpochMilli()));
    }
}
