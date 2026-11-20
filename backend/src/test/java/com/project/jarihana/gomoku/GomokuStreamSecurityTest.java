package com.project.jarihana.gomoku;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.gomoku.command.service.GomokuCommandService;
import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

class GomokuStreamSecurityTest extends IntegrationTestSupport {
    @Autowired WebApplicationContext context;
    @Autowired GomokuCommandService commands;
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;

    @Test
    @DisplayName("인증된 SSE가 종료될 때 비동기 디스패치에 새 인증을 요구하지 않는다")
    void completesAuthenticatedStreamWithoutReauthorizingAsyncDispatch() throws Exception {
        // Given
        Member host = members.save(Member.create("가을", 23, "async-host", Course.BACKEND));
        long id = commands.create(host.getId(), RoomVisibility.PUBLIC, GomokuRule.RENJU);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        var stream =
                mvc.perform(
                                get("/api/games/gomoku/rooms/" + id + "/events")
                                        .contextPath("/api")
                                        .cookie(
                                                new Cookie(
                                                        cookies.accessTokenName(),
                                                        tokens.issue(host.getId()).value())))
                        .andExpect(request().asyncStarted())
                        .andReturn();
        // When
        commands.leave(id, host.getId());
        stream.getAsyncResult(5000);
        // Then
        mvc.perform(asyncDispatch(stream)).andExpect(status().isOk());
    }
}
