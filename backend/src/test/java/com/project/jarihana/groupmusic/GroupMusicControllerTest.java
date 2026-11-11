package com.project.jarihana.groupmusic;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

import com.project.jarihana.groupmusic.client.YoutubeMusicClient;
import com.project.jarihana.groupmusic.client.YoutubeMusicClient.PlaylistTrack;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.Optional;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.specification.RequestSpecification;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;
import java.util.List;
import java.util.UUID;
import java.time.Instant;
import java.time.Duration;
import java.sql.Timestamp;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static com.project.jarihana.support.TestSupportConfig.ZONE;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class GroupMusicControllerTest extends IntegrationTestSupport {
    static final String MUSIC = "{\"enabled\":true,\"autoplay\":true,\"title\":\"우리 모임의 음악\",\"url\":\"https://www.youtube.com/watch?v=dQw4w9WgXcQ\"}";
    @Autowired MemberRepository members;
    @Autowired GroupJpaRepository groups;
    @Autowired GroupMemberJpaRepository memberships;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @MockitoBean YoutubeMusicClient youtube;
    private Member leader;
    private Member member;
    private Member outsider;
    private Group group;
    private String csrf;

    @BeforeEach
    void fixtures() {
        when(youtube.findPlayableDuration(anyString())).thenReturn(Optional.of(Duration.ofSeconds(120)));
        when(youtube.getPlaylistTrack(anyString(), anyInt())).thenAnswer(invocation ->
                new PlaylistTrack("dQw4w9WgXcQ", (int) invocation.getArgument(1) < 2));
        leader = members.save(Member.create("리더", 8, "space-leader", Course.BACKEND));
        member = members.save(Member.create("멤버", 8, "space-member", Course.BACKEND));
        outsider = members.save(Member.create("외부", 8, "space-outsider", Course.BACKEND));
        group = groups.save(Group.createStudy("공간 모임", "함께 꾸며요", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)), FIXED_NOW));
        memberships.save(GroupMember.createLeader(group, leader, FIXED_NOW));
        memberships.save(GroupMember.createMember(group, member, FIXED_NOW));
        csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
    }

    @Test
    void publicDefaultAndCurrentPermissions() {
        given().get(path()).then().statusCode(200).body("data.revision", equalTo(0))
                .body("data.music.enabled", equalTo(false)).body("data.music.autoplay", equalTo(true))
                .body("data.music.title", equalTo("우리 모임의 음악")).body("data.music.url", equalTo(""))
                .body("data.canEdit", equalTo(false)).body("data.updatedAt", nullValue());
        request(leader).get(path()).then().statusCode(200).body("data.canEdit", equalTo(true));
        request(member).get(path()).then().statusCode(200).body("data.canEdit", equalTo(false));
        given().get("/groups/999999/music").then().statusCode(404);
    }

    @Test
    void leaderSavesAndPublicReadsPersistedMusicWithoutSpaceRevision() {
        save(leader, MUSIC, 0).then().statusCode(200).body("data.revision", equalTo(1));
        given().get(path()).then().statusCode(200).body("data.music.url", equalTo("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
                .body("data.revision", equalTo(1));
        assertThat(jdbc.queryForObject("SELECT revision FROM group_music WHERE group_id = ?", Long.class, group.getId())).isEqualTo(1);
        request(leader).get("/groups/" + group.getId() + "/space").then().statusCode(200).body("data.revision", equalTo(0));
        save(leader, MUSIC.replace("true", "false"), 1).then().statusCode(200).body("data.revision", equalTo(2));
    }

    @Test
    void forbidsUnauthenticatedNonleaderAndMissingCsrfWrites() {
        given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json")
                .body(body(MUSIC, 0)).put(path()).then().statusCode(401);
        save(member, MUSIC, 0).then().statusCode(403);
        save(outsider, MUSIC, 0).then().statusCode(403);
        given().cookie(cookies.accessTokenName(), tokens.issue(leader.getId()).value())
                .contentType("application/json").body(body(MUSIC, 0)).put(path()).then().statusCode(403);
    }

    @Test
    void preservesMusicOnConflictAndEndedGroupIsReadonly() {
        save(leader, MUSIC, 0).then().statusCode(200);
        save(leader, MUSIC, 0).then().statusCode(409).body("error.code", equalTo("GROUP_MUSIC_CONFLICT"));
        groups.save(groups.findById(group.getId()).orElseThrow().endAt(FIXED_NOW.plusDays(2)));
        request(leader).get(path()).then().statusCode(200).body("data.canEdit", equalTo(false)).body("data.revision", equalTo(1));
        save(leader, MUSIC, 1).then().statusCode(409).body("error.code", equalTo("GROUP_ENDED"));
    }

    @Test
    void acceptsVideoPlaylistAndShareUrls() {
        List<String> urls = List.of("https://youtu.be/dQw4w9WgXcQ?si=test", "https://youtube.com/shorts/dQw4w9WgXcQ",
                "https://m.youtube.com/embed/dQw4w9WgXcQ", "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
                "https://www.youtube.com/playlist?list=PL1234567890_abc", "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890_abc");
        long revision = 0;
        for (String url : urls) {
            save(leader, musicWithUrl(url), revision++).then().statusCode(200);
        }
        save(leader, MUSIC.replace("true", "false").replace("https://www.youtube.com/watch?v=dQw4w9WgXcQ", ""), revision)
                .then().statusCode(200);
    }

    @Test
    void rejectsUnsafeUrlsAndInvalidSettingsWithoutSaving() {
        for (String url : List.of("http://youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
                "https://user@youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com:443/watch?v=dQw4w9WgXcQ",
                "https://youtube.com/watch?v=short", "https://youtube.com/playlist?list=short", "https://example.com/", "")) {
            save(leader, musicWithUrl(url), 0).then().statusCode(400);
        }
        save(leader, MUSIC.replace("우리 모임의 음악", "가".repeat(81)), 0).then().statusCode(400);
        save(leader, MUSIC.replace("\"enabled\":true", "\"enabled\":\"true\""), 0).then().statusCode(400);
        save(leader, MUSIC, -1).then().statusCode(400);
        given().get(path()).then().statusCode(200).body("data.revision", equalTo(0));
    }

    @Test
    void deletesMusicWithGroup() {
        save(leader, MUSIC, 0).then().statusCode(200);
        request(leader).delete("/groups/" + group.getId()).then().statusCode(204);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM group_music", Long.class)).isZero();
    }

    @Test
    void lateJoinUsesServerAnchorAndTitleOnlySavePreservesTimeline() {
        save(leader, MUSIC, 0).then().statusCode(200).body("data.playback.state", equalTo("PLAYING"))
                .body("data.playback.revision", equalTo(1));
        Instant anchor = FIXED_NOW.atZone(ZONE).toInstant().minusSeconds(120);
        jdbc.update("UPDATE group_music SET anchor_time = ?, position_seconds = 10 WHERE group_id = ?",
                Timestamp.from(anchor), group.getId());
        var response = given().get(path()).then().statusCode(200).extract().jsonPath();
        Instant serverTime = Instant.parse(response.getString("data.serverTime"));
        Instant storedAnchor = Instant.parse(response.getString("data.playback.anchorTime"));
        assertThat(response.getDouble("data.playback.positionSeconds") + Duration.between(storedAnchor, serverTime).toMillis() / 1000.0)
                .isEqualTo(130);
        save(leader, MUSIC.replace("우리 모임의 음악", "새 제목"), 1).then().statusCode(200)
                .body("data.playback.revision", equalTo(1)).body("data.playback.anchorTime", equalTo(anchor.toString()));
    }

    @Test
    void leaderControlsSharedPlaybackAndMembersCannotSeek() {
        save(leader, MUSIC, 0).then().statusCode(200);
        control(member, "PAUSED", 0, 42, 1).then().statusCode(403);
        control(leader, "PAUSED", 2, 42.5, 1).then().statusCode(200)
                .body("data.playback.state", equalTo("PAUSED")).body("data.playback.revision", equalTo(2));
        given().get(path()).then().statusCode(200).body("data.playback.playlistIndex", equalTo(2))
                .body("data.playback.positionSeconds", equalTo(42.5f));
        control(leader, "PLAYING", 2, 60, 1).then().statusCode(409).body("error.code", equalTo("GROUP_MUSIC_CONFLICT"));
        control(leader, "PLAYING", 2, 60, 2).then().statusCode(200).body("data.playback.revision", equalTo(3));
        save(leader, MUSIC.replace("dQw4w9WgXcQ", "abcdefghijk"), 1).then().statusCode(200)
                .body("data.playback.revision", equalTo(4)).body("data.playback.playlistIndex", equalTo(0))
                .body("data.playback.positionSeconds", equalTo(0.0f));
    }

    @Test
    void tooEarlyAdvanceCannotAlterTimelineAndConcurrentBoundaryAdvancesOnce() throws Exception {
        save(leader, MUSIC, 0).then().statusCode(200);
        advance(member, 1, 0, 120, 3).then().statusCode(409);
        advance(outsider, 1, 0, 120, 3).then().statusCode(403);
        given().get(path()).then().statusCode(200).body("data.playback.revision", equalTo(1));
        jdbc.update("UPDATE group_music SET anchor_time = ? WHERE group_id = ?",
                Timestamp.from(FIXED_NOW.atZone(ZONE).toInstant().minusSeconds(125)), group.getId());
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { start.await(); return advance(member, 1, 0, 120, 3).statusCode(); });
            var second = executor.submit(() -> { start.await(); return advance(leader, 1, 0, 120, 3).statusCode(); });
            start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS))).containsExactlyInAnyOrder(200, 409);
        }
        given().get(path()).then().statusCode(200).body("data.playback.revision", equalTo(2))
                .body("data.playback.playlistIndex", equalTo(0)).body("data.playback.positionSeconds", equalTo(5.0f));
    }

    @Test
    void singleVideoLoopsWithOverflowAndPausedOrEndedCannotAdvance() {
        save(leader, MUSIC, 0).then().statusCode(200);
        control(leader, "PLAYING", 0, 125, 1).then().statusCode(200);
        advance(member, 2, 0, 120, 1).then().statusCode(200).body("data.playback.playlistIndex", equalTo(0))
                .body("data.playback.positionSeconds", equalTo(5.0f)).body("data.playback.revision", equalTo(3));
        control(leader, "PAUSED", 0, 125, 3).then().statusCode(200);
        advance(member, 4, 0, 120, 1).then().statusCode(409);
        groups.save(groups.findById(group.getId()).orElseThrow().endAt(FIXED_NOW.plusDays(2)));
        control(leader, "PLAYING", 0, 125, 4).then().statusCode(409).body("error.code", equalTo("GROUP_ENDED"));
        advance(member, 4, 0, 120, 1).then().statusCode(409).body("error.code", equalTo("GROUP_ENDED"));
    }

    @Test
    @DisplayName("저장한 플레이리스트를 추가하거나 제거해도 재생 중인 곡과 위치를 유지한다")
    void libraryChangesPreservePlaybackAndSelectionChangeResetsIt() {
        // Given
        save(leader, MUSIC, 0).then().statusCode(200);
        control(leader, "PAUSED", 2, 42.5, 1).then().statusCode(200);
        String anchor = given().get(path()).jsonPath().getString("data.playback.anchorTime");
        ObjectNode music = (ObjectNode) mapper.readTree(MUSIC);
        var playlists = music.putArray("playlists");
        playlists.addObject().put("title", "우리 모임의 음악").put("url", music.get("url").asString());
        playlists.addObject().put("title", "저녁 재즈").put("url", "https://www.youtube.com/playlist?list=PL1234567890_jazz");

        // When
        save(leader, music.toString(), 1).then().statusCode(200).body("data.revision", equalTo(2));

        // Then
        given().get(path()).then().statusCode(200).body("data.music.playlists.size()", equalTo(2))
                .body("data.music.playlists[1].title", equalTo("저녁 재즈"))
                .body("data.playback.state", equalTo("PAUSED"))
                .body("data.playback.playlistIndex", equalTo(2)).body("data.playback.positionSeconds", equalTo(42.5f))
                .body("data.playback.revision", equalTo(2)).body("data.playback.anchorTime", equalTo(anchor));
        assertThat(mapper.readTree(jdbc.queryForObject("SELECT music_json FROM group_music WHERE group_id = ?",
                String.class, group.getId())).get("playlists").size()).isEqualTo(2);
        playlists.remove(1);
        save(leader, music.toString(), 2).then().statusCode(200)
                .body("data.playback.revision", equalTo(2)).body("data.playback.positionSeconds", equalTo(42.5f));
        playlists.addObject().put("title", "저녁 재즈").put("url", "https://www.youtube.com/playlist?list=PL1234567890_jazz");
        music.put("title", "저녁 재즈").put("url", "https://www.youtube.com/playlist?list=PL1234567890_jazz");
        save(leader, music.toString(), 3).then().statusCode(200)
                .body("data.playback.revision", equalTo(3)).body("data.playback.playlistIndex", equalTo(0))
                .body("data.playback.positionSeconds", equalTo(0.0f));
    }

    @Test
    @DisplayName("재생할 항목을 고르기 전에 플레이리스트를 저장하고 기존 요청 형식도 유지한다")
    void savesLibraryWithoutSelectionAndAcceptsLegacyRequest() {
        // Given
        ObjectNode music = (ObjectNode) mapper.readTree(MUSIC);
        music.put("enabled", false).put("url", "");
        music.putArray("playlists").addObject().put("title", "저녁 재즈")
                .put("url", "https://www.youtube.com/playlist?list=PL1234567890_jazz");

        // When / Then
        save(leader, music.toString(), 0).then().statusCode(200)
                .body("data.music.playlists.size()", equalTo(1)).body("data.playback.state", equalTo("PAUSED"));
        save(leader, MUSIC, 1).then().statusCode(200).body("data.music.playlists", nullValue());
    }

    @Test
    @DisplayName("중복 주소와 잘못된 항목 및 선택 목록 불일치는 저장하지 않는다")
    void rejectsInvalidPlaylistLibraryWithoutSaving() {
        // Given
        ObjectNode music = (ObjectNode) mapper.readTree(MUSIC);
        var entries = music.putArray("playlists");
        var selected = entries.addObject().put("title", "우리 모임의 음악").put("url", music.get("url").asString());
        List<String> invalidLibraries = List.of("null", "{}", "[]",
                "[" + selected + "," + selected + "]",
                "[" + selected.toString().replace("우리 모임의 음악", "다른 제목") + "]",
                "[" + selected + ",{\"title\":\"\",\"url\":\"https://youtu.be/abcdefghijk\"}]",
                "[" + selected + ",{\"title\":\"다른 곡\",\"url\":\"https://example.com\"}]",
                "[" + selected + ",{\"title\":\"다른 곡\",\"url\":\"https://youtu.be/abcdefghijk\",\"extra\":true}]",
                "[" + selected + ",{\"url\":\"https://youtu.be/abcdefghijk\"}]",
                "[" + selected + ",{\"title\":\"" + "가".repeat(81) + "\",\"url\":\"https://youtu.be/abcdefghijk\"}]");

        // When / Then
        for (String invalidLibrary : invalidLibraries) {
            music.set("playlists", mapper.readTree(invalidLibrary));
            save(leader, music.toString(), 0).then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
        }
        entries = music.putArray("playlists");
        entries.add(selected);
        for (int index = 0; index < 20; index++) {
            entries.addObject().put("title", "목록 " + index)
                    .put("url", "https://youtube.com/playlist?list=PL1234567890_" + index);
        }
        save(leader, music.toString(), 0).then().statusCode(400);
        given().get(path()).then().statusCode(200).body("data.revision", equalTo(0));
    }

    @Test
    @DisplayName("구성원이 처음 넣은 곡은 바로 재생되고 이후 곡은 대기열에 저장된다")
    void memberAddsCurrentTrackThenQueuesWithoutChangingPlayback() {
        // Given / When
        var first = enqueue(member, "첫 곡", "https://youtu.be/abcdefghijk").then().statusCode(200)
                .body("data.canEdit", equalTo(false)).body("data.canAdd", equalTo(true))
                .body("data.music.enabled", equalTo(true)).body("data.music.queue.size()", equalTo(0))
                .body("data.playback.state", equalTo("PLAYING")).extract().jsonPath();
        control(leader, "PLAYING", 0, 35, first.getLong("data.playback.revision")).then().statusCode(200);
        var before = given().get(path()).jsonPath();

        // Then
        var added = enqueue(member, "둘째 곡", "https://youtu.be/lmnopqrstuv").then().statusCode(200)
                .body("data.music.url", equalTo("https://www.youtube.com/watch?v=abcdefghijk"))
                .body("data.music.queue[0].title", equalTo("둘째 곡"))
                .body("data.music.queue[0].url", equalTo("https://www.youtube.com/watch?v=lmnopqrstuv")).extract().jsonPath();
        assertThat(added.getMap("data.playback")).isEqualTo(before.getMap("data.playback"));
        assertThat(added.getString("data.music.queue[0].id")).matches("[0-9a-f-]{36}");
        given().get(path()).then().statusCode(200).body("data.canAdd", equalTo(false))
                .body("data.music.queue.size()", equalTo(1));
        request(member).get(path()).then().statusCode(200).body("data.canAdd", equalTo(true));
        request(outsider).get(path()).then().statusCode(200).body("data.canAdd", equalTo(false));
    }

    @Test
    @DisplayName("두 구성원의 동시 추가가 모두 보존되고 대기열 식별자가 다르다")
    void concurrentMemberAddsPreserveBothQueueEntries() throws Exception {
        // Given
        enqueue(leader, "지금 듣는 곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        var start = new CountDownLatch(1);

        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { start.await(); return enqueue(member, "첫 신청", "https://youtu.be/lmnopqrstuv").statusCode(); });
            var second = executor.submit(() -> { start.await(); return enqueue(leader, "둘째 신청", "https://youtu.be/dQw4w9WgXcQ").statusCode(); });
            start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS))).containsOnly(200);
        }

        // Then
        var response = given().get(path()).then().statusCode(200).extract().jsonPath();
        assertThat(response.getList("data.music.queue.title", String.class)).containsExactlyInAnyOrder("첫 신청", "둘째 신청");
        assertThat(response.getList("data.music.queue.id", String.class)).doesNotHaveDuplicates().hasSize(2);
        assertThat(response.getLong("data.playback.revision")).isEqualTo(1);
        assertThat(response.getLong("data.revision")).isEqualTo(3);
    }

    @Test
    @DisplayName("현재 곡이 끝나면 대기열 첫 곡을 꺼내고 마지막 곡 뒤에는 반복 없이 멈춘다")
    void completionConsumesQueueInOrderAndStopsAfterLastTrack() {
        // Given
        enqueue(member, "첫 곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        enqueue(leader, "둘째 곡", "https://youtu.be/lmnopqrstuv").then().statusCode(200);
        enqueue(member, "셋째 곡", "https://youtu.be/dQw4w9WgXcQ").then().statusCode(200);
        control(leader, "PLAYING", 0, 125, 1).then().statusCode(200);

        // When / Then
        advance(member, 2, 0, 120, 1).then().statusCode(200)
                .body("data.music.title", equalTo("둘째 곡")).body("data.music.queue.size()", equalTo(1))
                .body("data.music.queue[0].title", equalTo("셋째 곡"))
                .body("data.playback.positionSeconds", equalTo(0.0f)).body("data.playback.revision", equalTo(3));
        advance(leader, 2, 0, 120, 1).then().statusCode(409);
        skip(leader, 3).then().statusCode(200).body("data.music.title", equalTo("셋째 곡"))
                .body("data.music.queue.size()", equalTo(0)).body("data.playback.revision", equalTo(4));
        control(leader, "PLAYING", 0, 125, 4).then().statusCode(200);
        advance(member, 5, 0, 120, 1).then().statusCode(200).body("data.music.enabled", equalTo(false))
                .body("data.music.url", equalTo("")).body("data.music.queue.size()", equalTo(0))
                .body("data.playback.state", equalTo("PAUSED")).body("data.playback.positionSeconds", equalTo(0.0f));
    }

    @Test
    @DisplayName("유튜브 재생목록의 내부 곡을 먼저 진행하고 끝에서 다음 신청곡을 재생한다")
    void playlistContinuesInternallyThenConsumesNextQueuedSource() {
        // Given
        String playlist = "https://youtube.com/playlist?list=PL1234567890_abc";
        save(leader, MUSIC.replace("https://www.youtube.com/watch?v=dQw4w9WgXcQ", playlist), 0)
                .then().statusCode(200);
        when(youtube.getPlaylistTrack(playlist.substring(playlist.indexOf("list=") + 5), 1))
                .thenReturn(new PlaylistTrack("abcdefghijk", false));
        enqueue(member, "다음 곡", "https://youtu.be/lmnopqrstuv").then().statusCode(200);
        control(leader, "PLAYING", 0, 122, 1).then().statusCode(200);

        // When / Then
        advance(member, 2, 0, 120, 2).then().statusCode(200).body("data.music.url", equalTo(playlist))
                .body("data.music.queue.size()", equalTo(1)).body("data.playback.playlistIndex", equalTo(1))
                .body("data.playback.positionSeconds", equalTo(2.0f)).body("data.revision", equalTo(2));
        control(leader, "PLAYING", 1, 125, 3).then().statusCode(200);
        advance(member, 4, 1, 120, 2).then().statusCode(200).body("data.music.title", equalTo("다음 곡"))
                .body("data.music.queue.size()", equalTo(0)).body("data.playback.playlistIndex", equalTo(0));
    }

    @Test
    @DisplayName("활성 모임 구성원만 추가하며 건너뛰기는 모임장과 최신 재생 상태에 한한다")
    void queueRequiresMembershipAndSkipRequiresLeaderAndRevision() {
        // Given / When / Then
        String body = "{\"title\":\"곡\",\"url\":\"https://youtu.be/abcdefghijk\"}";
        given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json")
                .body(body).post(path() + "/queue").then().statusCode(401);
        request(outsider).body(body).post(path() + "/queue").then().statusCode(403);
        given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value()).contentType("application/json")
                .body(body).post(path() + "/queue").then().statusCode(403);
        enqueue(member, "곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        skip(member, 1).then().statusCode(403);
        skip(leader, 0).then().statusCode(409);
        groups.save(groups.findById(group.getId()).orElseThrow().endAt(FIXED_NOW.plusDays(2)));
        enqueue(member, "곡", "https://youtu.be/abcdefghijk").then().statusCode(409).body("error.code", equalTo("GROUP_ENDED"));
        request(member).get(path()).then().statusCode(200).body("data.canAdd", equalTo(false));
    }

    @Test
    @DisplayName("기존 재생과 저장 목록을 유지하며 대기열을 도입하고 기존 전체 저장의 덮어쓰기를 막는다")
    void queueKeepsLegacySelectionAndLibraryAndRejectsWholeDocumentOverwrite() {
        // Given
        ObjectNode music = (ObjectNode) mapper.readTree(MUSIC);
        music.putArray("playlists").addObject().put("title", "우리 모임의 음악").put("url", music.get("url").asString());
        save(leader, music.toString(), 0).then().statusCode(200);
        control(leader, "PAUSED", 0, 35, 1).then().statusCode(200);

        // When
        enqueue(member, "신청곡", "https://youtu.be/abcdefghijk").then().statusCode(200)
                .body("data.music.url", equalTo("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
                .body("data.music.playlists.size()", equalTo(1)).body("data.playback.state", equalTo("PAUSED"))
                .body("data.playback.positionSeconds", equalTo(35.0f));

        // Then
        save(leader, music.toString(), 2).then().statusCode(409).body("error.code", equalTo("GROUP_MUSIC_CONFLICT"));
        skip(leader, 2).then().statusCode(200).body("data.music.title", equalTo("신청곡"))
                .body("data.music.playlists.size()", equalTo(1));
    }

    @Test
    @DisplayName("유효하지 않은 링크와 제목 및 50개 초과 대기열은 저장하지 않는다")
    void rejectsInvalidQueueEntriesAndQueueCapacityOverflow() {
        // Given / When / Then
        for (String url : List.of("https://example.com/music", "http://youtu.be/abcdefghijk", "https://youtube.com.evil.test/watch?v=abcdefghijk")) {
            enqueue(member, "곡", url).then().statusCode(400);
        }
        enqueue(member, " ", "https://youtu.be/abcdefghijk").then().statusCode(400);
        enqueue(member, "가".repeat(81), "https://youtu.be/abcdefghijk").then().statusCode(400);
        enqueue(member, "곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        ObjectNode music = (ObjectNode) mapper.readTree(jdbc.queryForObject("SELECT music_json FROM group_music WHERE group_id = ?", String.class, group.getId()));
        var queue = music.putArray("queue");
        for (int index = 0; index < 50; index++) queue.addObject().put("id", UUID.randomUUID().toString())
                .put("title", "곡 " + index).put("url", "https://youtu.be/abcdefghijk");
        jdbc.update("UPDATE group_music SET music_json = ? WHERE group_id = ?", music.toString(), group.getId());
        enqueue(member, "넘치는 곡", "https://youtu.be/abcdefghijk").then().statusCode(400);
        given().get(path()).then().statusCode(200).body("data.music.queue.size()", equalTo(50)).body("data.revision", equalTo(1));
    }

    @Test
    @DisplayName("같은 영상을 다시 신청해도 새 항목으로 재생하고 종료 뒤 새 신청으로 시작한다")
    void repeatedVideoGetsNewCurrentIdentityAndQueueCanRestart() {
        // Given
        var first = enqueue(member, "첫 신청", "https://youtu.be/abcdefghijk").then().statusCode(200).extract().jsonPath();
        String firstId = first.getString("data.music.currentQueueId");
        var queued = enqueue(member, "다시 듣기", "https://youtu.be/abcdefghijk").then().statusCode(200).extract().jsonPath();
        String nextId = queued.getString("data.music.queue[0].id");
        assertThat(nextId).isNotEqualTo(firstId);

        // When / Then
        advance(member, 1, 0, 120, 1).then().statusCode(409);
        advance(member, 1, 0, 120, 2).then().statusCode(409);
        given().get(path()).then().statusCode(200).body("data.music.queue.size()", equalTo(1));
        skip(leader, 1).then().statusCode(200).body("data.music.currentQueueId", equalTo(nextId))
                .body("data.music.url", equalTo("https://www.youtube.com/watch?v=abcdefghijk"))
                .body("data.playback.positionSeconds", equalTo(0.0f)).body("data.playback.revision", equalTo(2));
        skip(leader, 2).then().statusCode(200).body("data.music.currentQueueId", nullValue())
                .body("data.music.enabled", equalTo(false));
        enqueue(member, "새 신청", "https://youtu.be/lmnopqrstuv").then().statusCode(200)
                .body("data.music.enabled", equalTo(true)).body("data.music.queue.size()", equalTo(0))
                .body("data.playback.revision", equalTo(4)).body("data.playback.state", equalTo("PLAYING"));
    }

    @Test
    @DisplayName("동시에 도착한 곡 종료 보고는 대기열을 한 번만 소비한다")
    void concurrentCompletionConsumesOnlyOneEntry() throws Exception {
        // Given
        enqueue(member, "첫 곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        enqueue(member, "둘째 곡", "https://youtu.be/lmnopqrstuv").then().statusCode(200);
        enqueue(member, "셋째 곡", "https://youtu.be/dQw4w9WgXcQ").then().statusCode(200);
        control(leader, "PLAYING", 0, 120, 1).then().statusCode(200);
        var start = new CountDownLatch(1);

        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { start.await(); return advance(member, 2, 0, 120, 1).statusCode(); });
            var second = executor.submit(() -> { start.await(); return advance(leader, 2, 0, 120, 1).statusCode(); });
            start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        }

        // Then
        given().get(path()).then().statusCode(200).body("data.music.title", equalTo("둘째 곡"))
                .body("data.music.queue.size()", equalTo(1)).body("data.music.queue[0].title", equalTo("셋째 곡"))
                .body("data.playback.revision", equalTo(3));
    }

    @Test
    @DisplayName("새 신청곡으로 외부 재생목록 전체를 추가할 수 없다")
    void rejectsPlaylistOnlyQueueEntry() {
        // Given
        String playlist = "https://youtube.com/playlist?list=PL1234567890_abc";

        // When / Then
        enqueue(member, "재생목록", playlist).then().statusCode(400);
        given().get(path()).then().statusCode(200).body("data.revision", equalTo(0));
    }

    @Test
    @DisplayName("구성원이 보낸 짧은 길이와 목록 길이를 신뢰하지 않는다")
    void ignoresForgedDurationAndQueueLength() {
        // Given
        enqueue(member, "첫 곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        enqueue(member, "둘째 곡", "https://youtu.be/lmnopqrstuv").then().statusCode(200);
        control(leader, "PLAYING", 0, 20, 1).then().statusCode(200);

        // When / Then
        advance(member, 2, 0, 1, 1).then().statusCode(409);
        given().get(path()).then().statusCode(200).body("data.music.title", equalTo("첫 곡"))
                .body("data.music.queue.size()", equalTo(1))
                .body("data.music.durationSeconds", equalTo(120.0f));
    }

    @Test
    @DisplayName("영상 링크에 재생목록이 함께 있어도 해당 영상 한 곡만 추가한다")
    void normalizesVideoWithPlaylistParameter() {
        // Given / When / Then
        enqueue(member, "단일 곡", "https://youtube.com/watch?v=abcdefghijk&list=PL1234567890_abc")
                .then().statusCode(200)
                .body("data.music.url", equalTo("https://www.youtube.com/watch?v=abcdefghijk"));
    }

    @Test
    @DisplayName("모임원은 서버가 재생 불가를 확인한 곡을 건너뛸 수 있다")
    void memberSkipsOnlyServerConfirmedUnavailableVideo() {
        // Given
        enqueue(member, "첫 곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        enqueue(member, "둘째 곡", "https://youtu.be/lmnopqrstuv").then().statusCode(200);

        // When / Then
        reportUnavailable(member, 1).then().statusCode(409);
        when(youtube.findPlayableDuration("abcdefghijk")).thenReturn(Optional.empty());
        reportUnavailable(outsider, 1).then().statusCode(403);
        reportUnavailable(member, 1).then().statusCode(200)
                .body("data.music.title", equalTo("둘째 곡"))
                .body("data.music.lastSkippedTitle", equalTo("첫 곡"))
                .body("data.playback.positionSeconds", equalTo(0.0f));
        reportUnavailable(member, 1).then().statusCode(409);
        given().get(path()).then().statusCode(200).body("data.music.title", equalTo("둘째 곡"));
    }

    @Test
    @DisplayName("유튜브 조회 실패를 재생 불가로 오인해 대기열을 소비하지 않는다")
    void metadataOutagePreservesCurrentVideoAndQueue() {
        // Given
        enqueue(member, "첫 곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        enqueue(member, "둘째 곡", "https://youtu.be/lmnopqrstuv").then().statusCode(200);
        when(youtube.findPlayableDuration(anyString())).thenThrow(
                new BusinessException(ErrorCode.GROUP_MUSIC_VERIFICATION_UNAVAILABLE, "확인 실패"));

        // When / Then
        reportUnavailable(member, 1).then().statusCode(503);
        enqueue(member, "셋째 곡", "https://youtu.be/dQw4w9WgXcQ").then().statusCode(503);
        given().get(path()).then().statusCode(200).body("data.music.title", equalTo("첫 곡"))
                .body("data.music.queue.size()", equalTo(1)).body("data.playback.revision", equalTo(1));
    }

    @Test
    @DisplayName("확인되지 않은 클라이언트 영상 길이는 기존 저장 영상에도 적용하지 않는다")
    void verifiesDurationForLegacyVideo() {
        // Given
        save(leader, MUSIC, 0).then().statusCode(200);
        control(leader, "PLAYING", 0, 20, 1).then().statusCode(200);

        // When / Then
        advance(member, 2, 0, 1, 1).then().statusCode(409);
    }

    @Test
    @DisplayName("영상 길이 없는 종료 요청은 서버가 저장한 길이로 검증하고 다음 신청곡을 처음부터 재생한다")
    void advancesUsingOnlyServerVerifiedDuration() {
        // Given
        enqueue(member, "첫 곡", "https://youtu.be/abcdefghijk").then().statusCode(200);
        enqueue(member, "다음 곡", "https://youtu.be/dQw4w9WgXcQ").then().statusCode(200);
        control(leader, "PLAYING", 0, 125, 1).then().statusCode(200);

        // When / Then
        request(member).body("{\"expectedRevision\":2}").post(path() + "/playback/advance").then().statusCode(200)
                .body("data.music.title", equalTo("다음 곡"))
                .body("data.music.durationSeconds", equalTo(120.0f))
                .body("data.playback.positionSeconds", equalTo(0.0f));
    }

    @Test
    @DisplayName("기존 저장 영상도 삭제가 확인되면 같은 곡을 반복하지 않고 멈춘다")
    void stopsUnavailableLegacyVideo() {
        // Given
        save(leader, MUSIC, 0).then().statusCode(200);
        when(youtube.findPlayableDuration(anyString())).thenReturn(Optional.empty());

        // When / Then
        reportUnavailable(member, 1).then().statusCode(200)
                .body("data.music.enabled", equalTo(false))
                .body("data.playback.state", equalTo("PAUSED"))
                .body("data.music.url", equalTo(""));
    }

    private io.restassured.response.Response reportUnavailable(Member caller, long revision) {
        return request(caller).body("{\"expectedRevision\":" + revision + ",\"checkUnavailable\":true}")
                .post(path() + "/playback/advance");
    }

    private io.restassured.response.Response enqueue(Member caller, String title, String url) {
        ObjectNode body = mapper.createObjectNode().put("title", title).put("url", url);
        return request(caller).body(body.toString()).post(path() + "/queue");
    }

    private io.restassured.response.Response skip(Member caller, long revision) {
        return request(caller).body("{\"expectedRevision\":" + revision + "}").post(path() + "/queue/skip");
    }

    private io.restassured.response.Response control(Member caller, String state, int index, double position, long revision) {
        return request(caller).body("{\"state\":\"" + state + "\",\"playlistIndex\":" + index + ",\"positionSeconds\":" + position
                + ",\"expectedRevision\":" + revision + "}").put(path() + "/playback");
    }
    private io.restassured.response.Response advance(Member caller, long revision, int index, double duration, int queueLength) {
        return request(caller).body("{\"expectedRevision\":" + revision + ",\"playlistIndex\":" + index + ",\"trackDurationSeconds\":" + duration
                + ",\"queueLength\":" + queueLength + "}").post(path() + "/playback/advance");
    }

    private String musicWithUrl(String url) {
        ObjectNode music = (ObjectNode) mapper.readTree(MUSIC);
        music.put("url", url);
        return music.toString();
    }
    private RequestSpecification request(Member caller) {
        return given().cookie(cookies.accessTokenName(), tokens.issue(caller.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json");
    }
    private io.restassured.response.Response save(Member caller, String room, long revision) {
        return request(caller).body(body(room, revision)).put(path());
    }
    private String body(String room, long revision) { return "{\"music\":" + room + ",\"expectedRevision\":" + revision + "}"; }
    private String path() { return "/groups/" + group.getId() + "/music"; }
}
