package com.project.jarihana.groupspace;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.domain.SessionGroupSchedule;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.nio.file.Files;
import java.nio.file.Path;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class GroupSpaceControllerTest extends IntegrationTestSupport {
    static final String ROOM = """
            {"version":8,"name":"우리 아지트","template":"boardgame","theme":"wood",
            "avatarColor":"#536bd6","accentColor":"#536bd6","matColor":"#7b9b6d",
            "food":"pizza","coverPhoto":"","notice":"이번 주 모임",
            "atmosphere":{"backgroundColor":"#dbc9df","backgroundStyle":"gradient","ambient":70,
            "sunlight":80,"warmth":65,"sunAngle":120,"lamps":90,"shadowSoftness":60,
            "shadows":true,"wallColor":"","floorColor":""},
            "items":[{"id":"table-1","kind":"gameTable","x":0,"z":0,"rotation":0,"level":0}]}
            """;
    @Autowired MemberRepository members;
    @Autowired GroupJpaRepository groups;
    @Autowired GroupMemberJpaRepository memberships;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private Member leader;
    private Member member;
    private Member outsider;
    private Group group;
    private String csrf;

    @BeforeEach
    void fixtures() {
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
    void savesRoomAndReadsPersistedRevisionAsMember() {
        request(leader).get(path()).then().statusCode(200)
                .body("data.room", nullValue()).body("data.revision", equalTo(0)).body("data.canEdit", equalTo(true));
        save(leader, ROOM, 0).then().statusCode(200)
                .body("data.revision", equalTo(1)).body("data.room.name", equalTo("우리 아지트"));
        request(member).get(path()).then().statusCode(200)
                .body("data.revision", equalTo(1)).body("data.canEdit", equalTo(false))
                .body("data.room.items[0].kind", equalTo("gameTable"));
        assertThat(jdbc.queryForObject("SELECT revision FROM group_space WHERE group_id = ?", Long.class, group.getId()))
                .isEqualTo(1);
        save(leader, ROOM.replace("우리 아지트", "새 아지트"), 1).then().statusCode(200).body("data.revision", equalTo(2));
        request(member).get(path()).then().statusCode(200).body("data.room.name", equalTo("새 아지트"));
    }

    @Test
    void sessionHasNoSpaceEvenForItsLeader() {
        Group session = groups.save(Group.createSession("같이해요", "함께 놀아요", null, null,
                SessionGroupSchedule.of(FIXED_NOW.toLocalDate().plusDays(1), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                FIXED_NOW));
        memberships.save(GroupMember.createLeader(session, leader, FIXED_NOW));
        String sessionPath = "/groups/" + session.getId() + "/space";

        given().get(sessionPath).then().statusCode(404).body("error.code", equalTo("GROUP_SPACE_NOT_AVAILABLE"));
        request(leader).body(body(ROOM, 0)).put(sessionPath).then().statusCode(404)
                .body("error.code", equalTo("GROUP_SPACE_NOT_AVAILABLE"));
    }

    @Test
    void rejectsStaleRevisionWithoutOverwriting() {
        save(leader, ROOM, 0).then().statusCode(200);
        save(leader, ROOM.replace("우리 아지트", "덮어쓰기"), 0).then().statusCode(409)
                .body("error.code", equalTo("GROUP_SPACE_CONFLICT"));
        request(leader).get(path()).then().statusCode(200).body("data.room.name", equalTo("우리 아지트"));
    }

    @Test
    void enforcesMembershipAuthenticationAndCsrf() {
        given().get(path()).then().statusCode(200).body("data.canEdit", equalTo(false));
        request(outsider).get(path()).then().statusCode(200).body("data.canEdit", equalTo(false));
        save(outsider, ROOM, 0).then().statusCode(403);
        save(member, ROOM, 0).then().statusCode(403);
        given().cookie(cookies.accessTokenName(), tokens.issue(leader.getId()).value())
                .contentType("application/json").body(body(ROOM, 0)).put(path()).then().statusCode(403);
        request(leader).get("/groups/999999/space").then().statusCode(404);
    }

    @Test
    @DisplayName("공개 공간은 배치만 제공하고 멤버 전용 사진과 메모를 노출하지 않는다")
    void publicGeometryHidesMemberContentWithoutChangingSavedRoom() {
        // Given
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        room.put("coverPhoto", "data:image/png;base64,YQ==");
        ObjectNode frame = ((ArrayNode) room.get("items")).addObject();
        frame.put("id", "private-frame").put("kind", "memory").put("x", 1).put("z", 1)
                .put("rotation", 0).put("level", 0).put("title", "멤버 사진")
                .put("note", "멤버 메모").put("photo", "data:image/png;base64,YQ==")
                .put("link", "https://example.com/private");
        save(leader, mapper.writeValueAsString(room), 0).then().statusCode(200);

        // When / Then
        given().get(path()).then().statusCode(200)
                .body("data.revision", equalTo(1)).body("data.room.notice", equalTo(""))
                .body("data.room.coverPhoto", equalTo(""))
                .body("data.room.items[1].kind", equalTo("memory"))
                .body("data.room.items[1].title", equalTo(""))
                .body("data.room.items[1].note", equalTo(""))
                .body("data.room.items[1].photo", equalTo(""))
                .body("data.room.items[1].link", equalTo(""));
        request(outsider).get(path()).then().statusCode(200)
                .body("data.room.items[1].photo", equalTo(""));
        request(member).get(path()).then().statusCode(200)
                .body("data.room.notice", equalTo("이번 주 모임"))
                .body("data.room.items[1].photo", equalTo("data:image/png;base64,YQ=="));
        given().get("/groups/999999/space").then().statusCode(404);
    }

    @Test
    void endedGroupRemainsReadableButCannotSave() {
        save(leader, ROOM, 0).then().statusCode(200);
        groups.save(groups.findById(group.getId()).orElseThrow().endAt(FIXED_NOW.plusDays(2)));
        request(leader).get(path()).then().statusCode(200).body("data.canEdit", equalTo(false));
        save(leader, ROOM, 1).then().statusCode(409).body("error.code", equalTo("GROUP_ENDED"));
    }

    @Test
    void validatesRoomVersionNumbersPhotosAndRevision() {
        save(leader, ROOM.replace("\"version\":8", "\"version\":7"), 0).then().statusCode(400);
        save(leader, ROOM.replace("\"ambient\":70", "\"ambient\":151"), 0).then().statusCode(400);
        save(leader, ROOM.replace("\"coverPhoto\":\"\"", "\"coverPhoto\":\"https://example.com/a.png\""), 0).then().statusCode(400);
        request(leader).body("{\"room\":" + ROOM + "}").put(path()).then().statusCode(400);
        save(leader, ROOM, -1).then().statusCode(400);
        request(leader).get(path()).then().statusCode(200).body("data.revision", equalTo(0));
    }

    @Test
    void concurrentFirstSaveHasExactlyOneWinner() throws Exception {
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { start.await(); return save(leader, ROOM, 0).statusCode(); });
            var second = executor.submit(() -> { start.await(); return save(leader, ROOM, 0).statusCode(); });
            start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM group_space WHERE group_id = ?", Long.class, group.getId()))
                .isEqualTo(1);
        request(leader).get(path()).then().statusCode(200).body("data.revision", equalTo(1));
    }

    @Test
    void leadershipTransferChangesSavePermissionImmediately() {
        save(leader, ROOM, 0).then().statusCode(200);
        long membershipId = jdbc.queryForObject("SELECT id FROM group_member WHERE group_id = ? AND member_id = ?",
                Long.class, group.getId(), member.getId());
        request(leader).body("{\"groupMemberId\":" + membershipId + "}")
                .put("/groups/" + group.getId() + "/leader").then().statusCode(200);
        save(leader, ROOM, 1).then().statusCode(403);
        save(member, ROOM, 1).then().statusCode(200).body("data.revision", equalTo(2));
    }

    @Test
    void migrationSupportsSavingAndDeletingGroupWithoutOrphanedSpace() throws Exception {
        String migration = Files.readString(Path.of("src/main/resources/db/migration/V40__group_space.sql"));
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.createStatement()) {
                statement.execute("CREATE SCHEMA space_migration_test");
                try {
                    statement.execute("SET search_path TO space_migration_test");
                    statement.execute("CREATE TABLE groups (id BIGINT PRIMARY KEY)");
                    statement.execute(migration);
                    statement.execute("INSERT INTO groups VALUES (1)");
                    statement.execute("INSERT INTO group_space (group_id, room_json, revision, created_at, updated_at) VALUES (1, '{}', 1, now(), now())");
                    statement.execute("DELETE FROM groups WHERE id = 1");
                    try (var rows = statement.executeQuery("SELECT COUNT(*) FROM group_space")) {
                        rows.next();
                        assertThat(rows.getLong(1)).isZero();
                    }
                } finally {
                    statement.execute("SET search_path TO public");
                    statement.execute("DROP SCHEMA space_migration_test CASCADE");
                }
            }
            return null;
        });
        save(leader, ROOM, 0).then().statusCode(200);
        request(leader).delete("/groups/" + group.getId()).then().statusCode(204);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM group_space", Long.class)).isZero();
    }

    @Test
    void validatesItemIdsCoordinatesLinksAndPayloadBoundaries() {
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        ArrayNode items = (ArrayNode) room.get("items");
        items.add(items.get(0).deepCopy());
        save(leader, room.toString(), 0).then().statusCode(400);
        items.remove(1);
        ((ObjectNode) items.get(0)).put("x", 65);
        save(leader, room.toString(), 0).then().statusCode(400);
        ((ObjectNode) items.get(0)).put("x", 0).put("kind", "memory").put("link", "javascript:alert(1)");
        save(leader, room.toString(), 0).then().statusCode(400);
        ((ObjectNode) items.get(0)).put("link", "https://user:pass@example.com/");
        save(leader, room.toString(), 0).then().statusCode(400);
        ((ObjectNode) items.get(0)).put("link", "https://example.com/record");
        save(leader, room.toString(), 0).then().statusCode(200);
        room.put("coverPhoto", "data:image/png;base64," + "A".repeat(220_000));
        save(leader, room.toString(), 1).then().statusCode(400);
        room.put("coverPhoto", "");
        items.removeAll();
        for (int i = 0; i < 10; i++) {
            items.addObject().put("id", "photo-" + i).put("kind", "memory").put("x", i).put("z", 0)
                    .put("rotation", 0).put("photo", "data:image/png;base64," + "A".repeat(219_000));
        }
        save(leader, room.toString(), 1).then().statusCode(400);
        request(leader).get(path()).then().statusCode(200).body("data.revision", equalTo(1));
    }

    @Test
    @DisplayName("v9 공간은 모든 테마의 공용 에셋과 기존 층 배치를 저장하고 다시 읽는다")
    void savesVersionNineSharedAssetsAcrossAllTemplates() throws Exception {
        // Given
        var catalog = mapper.readTree(Files.readString(Path.of("src/test/resources/group-space-v9-catalog.json")));
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        room.put("version", 9);
        ArrayNode items = (ArrayNode) room.get("items");
        items.removeAll();
        for (var kind : catalog.get("kinds")) {
            items.addObject().put("id", "asset-" + kind.asString()).put("kind", kind.asString())
                    .put("x", 0).put("z", 0).put("rotation", 1).put("color", "#987654");
        }
        long revision = 0;
        for (var template : catalog.get("templates")) {
            int level = template.asString().equals("lounge") ? 0 : 1;
            room.put("template", template.asString());
            room.put("theme", template.asString().equals("band") ? "rehearsal"
                    : template.asString().equals("photo") ? "gallery" : "studio");
            ((ObjectNode) items.get(0)).put("level", level);
            // When
            save(leader, room.toString(), revision).then().statusCode(200);
            revision++;
            // Then
            request(member).get(path()).then().statusCode(200)
                    .body("data.room.version", equalTo(9))
                    .body("data.room.template", equalTo(template.asString()))
                    .body("data.room.items[0].level", equalTo(level))
                    .body("data.room.items.size()", equalTo(catalog.get("kinds").size()))
                    .body("data.revision", equalTo((int) revision));
        }
    }

    @Test
    @DisplayName("기본 아지트의 2층 배치는 v12에서만 저장할 수 있다")
    void savesSecondFloorFurnitureForCurrentDefaultClubhouse() {
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        room.put("version", 8).put("template", "lounge");
        ((ObjectNode) room.get("items").get(0)).put("level", 1);
        save(leader, room.toString(), 0).then().statusCode(400);

        room.put("version", 11);
        save(leader, room.toString(), 0).then().statusCode(400);
        room.put("version", 12).put("template", "boardgame");
        save(leader, room.toString(), 0).then().statusCode(400);
        room.put("template", "lounge");
        save(leader, room.toString(), 0).then().statusCode(200);
        request(member).get(path()).then().statusCode(200)
                .body("data.room.version", equalTo(12))
                .body("data.room.items[0].level", equalTo(1));
    }

    @Test
    @DisplayName("공통 기능 에셋은 v9에서 이동 배치를 보존하고 삭제해도 공지 내용은 유지한다")
    void preservesCommonAssetPlacementAndNoticeAfterAssetRemoval() throws Exception {
        // Given
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        room.put("version", 9);
        ArrayNode items = (ArrayNode) room.get("items");
        items.addObject().put("id", "activity-board").put("kind", "activityBoard")
                .put("x", 2.5).put("z", -3.25).put("rotation", 3).put("color", "#987654");
        items.addObject().put("id", "club-dashboard").put("kind", "clubDashboard")
                .put("x", -4.5).put("z", 1.25).put("rotation", 1);

        // When
        save(leader, room.toString(), 0).then().statusCode(200);

        // Then
        request(member).get(path()).then().statusCode(200)
                .body("data.room.items[1].kind", equalTo("activityBoard"))
                .body("data.room.items[1].x", equalTo(2.5f))
                .body("data.room.items[1].z", equalTo(-3.25f))
                .body("data.room.items[1].rotation", equalTo(3))
                .body("data.room.items[1].color", equalTo("#987654"))
                .body("data.room.items[2].kind", equalTo("clubDashboard"));
        room.put("version", 8);
        save(leader, room.toString(), 1).then().statusCode(400);
        room.put("version", 9);
        items.removeAll();
        save(leader, room.toString(), 1).then().statusCode(200);
        request(member).get(path()).then().statusCode(200)
                .body("data.room.items.size()", equalTo(0))
                .body("data.room.notice", equalTo("이번 주 모임"));
    }

    @Test
    @DisplayName("v9 공간은 160개까지 저장하고 이전 문서 한도와 알 수 없는 필드를 거절한다")
    void preservesVersionedCapacityAndStrictDocumentContract() {
        // Given
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        room.put("version", 9).put("template", "study").put("theme", "studio");
        ArrayNode items = (ArrayNode) room.get("items");
        items.removeAll();
        for (int index = 0; index < 160; index++) {
            items.addObject().put("id", "plant-" + index).put("kind", "plant")
                    .put("x", 0).put("z", 0).put("rotation", 0);
        }
        // When / Then
        save(leader, room.toString(), 0).then().statusCode(200);
        items.addObject().put("id", "overflow").put("kind", "plant").put("x", 0).put("z", 0).put("rotation", 0);
        save(leader, room.toString(), 1).then().statusCode(400);
        items.remove(160);
        room.put("version", 8).put("template", "boardgame").put("theme", "wood");
        save(leader, room.toString(), 1).then().statusCode(400);
        room.put("version", 9);
        ((ObjectNode) items.get(0)).put("mount", "ceiling");
        save(leader, room.toString(), 1).then().statusCode(400);
        ((ObjectNode) items.get(0)).remove("mount");
        ((ObjectNode) items.get(0)).put("kind", "unknownAsset");
        save(leader, room.toString(), 1).then().statusCode(400);
        ((ObjectNode) items.get(0)).put("kind", "plant").put("level", 2);
        room.put("template", "lounge");
        save(leader, room.toString(), 1).then().statusCode(400);
        request(member).get(path()).then().statusCode(200).body("data.revision", equalTo(1))
                .body("data.room.items.size()", equalTo(160));
    }

    @Test
    @DisplayName("야외 분위기를 저장하고 방문자도 같은 설정을 조회한다")
    void persistsOutdoorAtmosphereAndPreservesLegacyRoom() {
        // Given
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        room.put("version", 9);
        ObjectNode atmosphere = (ObjectNode) room.get("atmosphere");
        ObjectNode outdoors = atmosphere.putObject("outdoors");
        outdoors.put("mode", "fixed").put("phase", "night").put("weather", "snow");

        // When / Then
        save(leader, room.toString(), 0).then().statusCode(200);
        given().get(path()).then().statusCode(200)
                .body("data.room.atmosphere.outdoors.mode", equalTo("fixed"))
                .body("data.room.atmosphere.outdoors.phase", equalTo("night"))
                .body("data.room.atmosphere.outdoors.weather", equalTo("snow"));
        outdoors.put("mode", "live").put("phase", "day").put("weather", "clear");
        save(leader, room.toString(), 1).then().statusCode(200);
        outdoors.put("mode", "custom").put("phase", "dusk").put("weather", "cloudy");
        save(leader, room.toString(), 2).then().statusCode(200);
        save(leader, ROOM, 3).then().statusCode(200);
        request(member).get(path()).then().statusCode(200)
                .body("data.room.atmosphere.outdoors", nullValue())
                .body("data.room.atmosphere.ambient", equalTo(70));
    }

    @Test
    @DisplayName("잘못되거나 일부만 있는 야외 분위기는 저장하지 않는다")
    void rejectsInvalidOutdoorAtmosphereWithoutSaving() {
        // Given
        ObjectNode room = (ObjectNode) mapper.readTree(ROOM);
        ObjectNode atmosphere = (ObjectNode) room.get("atmosphere");
        List<String> invalid = List.of(
                "null", "[]", "{}",
                "{\"mode\":\"live\",\"phase\":\"day\"}",
                "{\"mode\":\"invalid\",\"phase\":\"day\",\"weather\":\"clear\"}",
                "{\"mode\":\"fixed\",\"phase\":\"noon\",\"weather\":\"clear\"}",
                "{\"mode\":\"fixed\",\"phase\":\"day\",\"weather\":\"storm\"}",
                "{\"mode\":\"live\",\"phase\":\"day\",\"weather\":\"clear\",\"extra\":true}");

        // When / Then
        for (String value : invalid) {
            atmosphere.set("outdoors", mapper.readTree(value));
            save(leader, room.toString(), 0).then().statusCode(400)
                    .body("error.code", equalTo("INVALID_PARAMETER"));
        }
        request(leader).get(path()).then().statusCode(200).body("data.revision", equalTo(0));
    }

    private RequestSpecification request(Member caller) {
        return given().cookie(cookies.accessTokenName(), tokens.issue(caller.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json");
    }
    @DisplayName("v10과 v11 전체 프리셋은 야외 설정과 에셋 부착 정보를 함께 보존한다")
    @Test
    void savesCompletePresetsWithOutdoorsWithoutRewriting() throws Exception {
        long revision = 0;
        for (int version : List.of(10, 11)) {
            try (var input = getClass().getResourceAsStream("/group-space-v" + version + "-presets.json")) {
                var presets = mapper.readTree(input);
                for (String theme : List.of("climbing", "boardgame", "dining", "band", "study", "photo")) {
                    ObjectNode room = (ObjectNode) presets.get(theme).deepCopy();
                    ((ObjectNode) room.get("atmosphere")).putObject("outdoors")
                            .put("mode", "fixed").put("phase", "night").put("weather", "snow");
                    save(leader, room.toString(), revision++).then().statusCode(200);
                    String response = request(member).get(path()).then().statusCode(200)
                            .body("data.revision", equalTo((int) revision)).extract().asString();
                    assertThat(mapper.readTree(response).get("data").get("room")).isEqualTo(room);
                    given().get(path()).then().statusCode(200)
                            .body("data.room.version", equalTo(version))
                            .body("data.room.atmosphere.outdoors.weather", equalTo("snow"));
                }
            }
        }
    }

    private io.restassured.response.Response save(Member caller, String room, long revision) {
        return request(caller).body(body(room, revision)).put(path());
    }
    private String body(String room, long revision) { return "{\"room\":" + room + ",\"expectedRevision\":" + revision + "}"; }
    private String path() { return "/groups/" + group.getId() + "/space"; }
}
