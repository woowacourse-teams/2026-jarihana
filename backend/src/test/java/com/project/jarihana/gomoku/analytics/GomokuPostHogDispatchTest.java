package com.project.jarihana.gomoku.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.project.jarihana.gomoku.command.service.GomokuCommandService;
import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@TestPropertySource(properties = {
        "gomoku.posthog.enabled=true",
        "gomoku.posthog.project-token=phc_test",
        "gomoku.posthog.host=https://posthog.example.test",
        "gomoku.posthog.poll-delay=1h"
})
class GomokuPostHogDispatchTest extends IntegrationTestSupport {
    @Autowired private GomokuCommandService commands;
    @Autowired private GomokuPostHogDispatcher dispatcher;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private MemberRepository members;
    @MockitoBean private GomokuPostHogClient client;

    @Test
    @DisplayName("PostHog 전송 실패 후 같은 UUID와 시각으로 재시도하고 성공하면 대기열에서 제거한다")
    void retriesIdenticalEventsAndRemovesThemOnSuccess() {
        // Given
        long host = members.save(Member.create("가온", 23, "10001", Course.BACKEND)).getId();
        long guest = members.save(Member.create("해솔", 23, "10002", Course.BACKEND)).getId();
        long room = commands.create(host, RoomVisibility.PRIVATE, GomokuRule.RENJU);
        commands.join(room, guest, commands.invite(room, host));
        commands.ready(room, host, true, 1);
        commands.ready(room, guest, true, 1);
        commands.start(room, host, 1);
        commands.resign(room, guest, 1);

        long game = jdbc.queryForObject("select id from gomoku_game where room_id = ?", Long.class, room);
        UUID started = eventId(game, "gomoku_game_started");
        UUID finished = eventId(game, "gomoku_game_finished");
        String payload = """
                {
                  "api_key": "phc_test",
                  "batch": [
                    {
                      "uuid": "%s",
                      "event": "gomoku_game_started",
                      "timestamp": "2026-08-19T01:00:00Z",
                      "distinct_id": "gomoku-game-%s",
                      "properties": {"game_id": "gomoku-game-%s", "$process_person_profile": false, "$geoip_disable": true}
                    },
                    {
                      "uuid": "%s",
                      "event": "gomoku_game_finished",
                      "timestamp": "2026-08-19T01:00:00Z",
                      "distinct_id": "gomoku-game-%s",
                      "properties": {"game_id": "gomoku-game-%s", "$process_person_profile": false, "$geoip_disable": true,
                                     "end_reason": "RESIGN", "duration_ms": 0, "move_count": 0}
                    }
                  ]
                }
                """.formatted(started, game, game, finished, game, game);
        RestClient.Builder builder = RestClient.builder().baseUrl("https://posthog.example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GomokuPostHogClient httpClient = new GomokuPostHogClient(builder.build(), "phc_test", TestSupportConfig.ZONE);
        doAnswer(invocation -> {
            httpClient.capture(invocation.getArgument(0));
            return null;
        }).when(client).capture(anyList());

        // When
        expectBatch(server, payload, withServerError());
        assertThatThrownBy(dispatcher::deliverPending).isInstanceOf(HttpServerErrorException.class);
        server.verify();
        assertThat(pendingIds()).containsExactlyInAnyOrder(started, finished);

        server.reset();
        try (var competingWorker = Executors.newSingleThreadExecutor()) {
            expectBatch(server, payload, request -> {
                try {
                    // The first transaction is still holding the outbox row locks.
                    competingWorker.submit(dispatcher::deliverPending).get(5, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException(exception);
                } catch (ExecutionException | TimeoutException exception) {
                    throw new IOException(exception);
                }
                return withSuccess().createResponse(request);
            });
            dispatcher.deliverPending();
        }
        dispatcher.deliverPending();

        // Then
        server.verify();
        assertThat(pendingIds()).isEmpty();
    }

    private void expectBatch(MockRestServiceServer server, String payload, ResponseCreator response) {
        server.expect(requestTo("https://posthog.example.test/batch/"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json(payload, JsonCompareMode.STRICT))
                .andRespond(response);
    }

    private UUID eventId(long gameId, String name) {
        return jdbc.queryForObject("select id from gomoku_posthog_outbox where game_id = ? and event_name = ?",
                UUID.class, gameId, name);
    }

    private List<UUID> pendingIds() {
        return jdbc.queryForList("select id from gomoku_posthog_outbox", UUID.class);
    }
}
