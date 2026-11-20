package com.project.jarihana.rhythmbattle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.rhythm.domain.RhythmInput;
import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.command.service.RhythmBattleChatCommandService;
import com.project.jarihana.rhythmbattle.command.service.RhythmBattleCommandService;
import com.project.jarihana.rhythmbattle.command.service.dto.RhythmBattleBatchCommand;
import com.project.jarihana.rhythmbattle.domain.BattleVisibility;
import com.project.jarihana.rhythmbattle.stream.RhythmBattleStreams;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

class RhythmBattleStreamTest extends IntegrationTestSupport {
    @Autowired WebApplicationContext context;
    @Autowired RhythmBattleCommandService commands;
    @Autowired RhythmBattleChatCommandService chats;
    @Autowired RhythmBattleStreams streams;
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void closeServerStreamsBeforeDatabaseReset() {
        streams.stop();
        streams.start();
    }

    @Test
    @DisplayName("참가자의 실시간 연결로 방 모습, 상대의 입력 묶음과 채팅을 보내고 방이 닫히면 연결을 끝낸다")
    void streamsSnapshotsOpponentBatchesAndChat() throws Exception {
        // Given
        Member host = members.save(Member.create("가을", 23, "battle-stream-host", Course.BACKEND));
        Member guest = members.save(Member.create("겨울", 23, "battle-stream-guest", Course.BACKEND));
        long id = commands.create(host.getId(), BattleVisibility.PUBLIC, RhythmLevel.EASY);
        commands.join(id, guest.getId(), null);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        MvcResult stream = mvc.perform(get("/api/games/rhythm-battle/rooms/" + id + "/events")
                        .contextPath("/api")
                        .cookie(new Cookie(cookies.accessTokenName(), tokens.issue(host.getId()).value())))
                .andExpect(request().asyncStarted())
                .andReturn();

        // When
        chats.send(id, guest.getId(), UUID.randomUUID(), "준비됐어요");
        commands.ready(id, host.getId(), true, 1, 1);
        commands.ready(id, guest.getId(), true, 1, 1);
        commands.start(id, host.getId(), 1);
        jdbc.update("update rhythm_battle_run set starts_at=?, last_batch_at=? where room_id=?",
                TestSupportConfig.FIXED_NOW.minusSeconds(3), TestSupportConfig.FIXED_NOW, id);
        commands.submit(id, guest.getId(),
                new RhythmBattleBatchCommand(1, 1, 2.5, List.of(RhythmInput.of(1, 2.25)), false));
        String guestBatch = "\"memberId\":" + guest.getId() + ",\"sequence\":1";
        waitFor(stream, guestBatch);
        commands.leave(id, host.getId());
        stream.getAsyncResult(5000);

        // Then
        mvc.perform(asyncDispatch(stream)).andExpect(status().isOk());
        String body = stream.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains("event:snapshot", "\"status\":\"WAITING\"", "\"status\":\"PLAYING\"",
                "\"status\":\"CLOSED\"");
        assertThat(body).contains("event:chat", "준비됐어요");
        assertThat(body).contains("event:batches", guestBatch, "[1,2.25]");
    }

    private static void waitFor(MvcResult stream, String text) throws Exception {
        for (int attempt = 0; attempt < 50; attempt++) {
            if (stream.getResponse().getContentAsString(StandardCharsets.UTF_8).contains(text)) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("실시간 연결에서 받지 못했어요: " + text);
    }
}
