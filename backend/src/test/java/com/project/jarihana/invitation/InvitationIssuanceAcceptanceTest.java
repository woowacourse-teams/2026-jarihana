package com.project.jarihana.invitation;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.Base64;
import java.security.SecureRandom;
import java.util.concurrent.Executors;
import java.util.concurrent.Callable;
import java.util.List;
import java.util.stream.IntStream;
import java.util.concurrent.CountDownLatch;

import static org.assertj.core.api.Assertions.assertThat;

class InvitationIssuanceAcceptanceTest extends NotificationIntegrationTestSupport {

    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;

    @DynamicPropertySource
    static void tokenKeys(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        String encoded = Base64.getEncoder().encodeToString(key);
        registry.add("jarihana.invitation.token.active-key-id", () -> "test");
        registry.add("jarihana.invitation.token.keys.test", () -> encoded);
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> 2);
        registry.add("spring.datasource.hikari.minimum-idle", () -> 1);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @DisplayName("모집이 없는 모임에서도 모임장과 모임원은 지정 초대와 대상의 활성 구독별 알림을 만든다.")
    void leaderAndMemberIssueDirectInvitationWithActiveDeliveries(boolean leaderIssues) {
        // Given
        Member leader = member("101");
        Member inviter = leaderIssues ? leader : member("102");
        Member target = member("103");
        Group group = group(leader);
        if (!leaderIssues) groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        subscription(target, "one");
        subscription(target, "two");
        subscriptions.save(subscription(target, "disabled").disable(NOW));
        subscription(inviter, "inviter");

        // When
        Response response = issue(inviter, group.getId(), direct(target, UUID.randomUUID(), "  초대 메시지  "));

        // Then
        assertThat(response.statusCode()).isEqualTo(201);
        long id = response.jsonPath().getLong("data.id");
        assertThat(response.header("Cache-Control")).contains("no-store");
        assertThat(response.jsonPath().getString("data.message")).isEqualTo("초대 메시지");
        assertThat(response.jsonPath().getString("data.sharePath")).isEqualTo("/invitations/" + id);
        assertThat(response.jsonPath().getString("data.status")).isEqualTo("ACTIVE");
        assertThat(response.jsonPath().getString("data.expiresAt")).isNull();
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(target.getId());
        assertThat(jdbc.queryForObject("select event_type from notifications", String.class)).isEqualTo("INVITATION_RECEIVED");
        assertThat(jdbc.queryForObject("select payload ->> 'invitationId' from notifications", Long.class)).isEqualTo(id);
        assertThat(jdbc.queryForObject("select payload::text from notifications", String.class))
                .doesNotContain("recruitmentId", "registrationId", "초대 메시지", "token");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from registration", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
    }

    @Test
    @DisplayName("같은 requestId로 다시 요청하면 메시지 앞뒤 공백을 제외해 기존 초대를 반환하고, 내용이 다르면 거부하며 새 requestId면 초대와 알림을 새로 만든다.")
    void retryReusesInvitationAndNewRequestCreatesAnotherInboxWithoutSubscription() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        UUID requestId = UUID.randomUUID();
        Response first = issue(leader, group.getId(), direct(target, requestId, "  함께해요  "));

        // When
        Response retry = issue(leader, group.getId(), direct(target, requestId, "함께해요"));
        Response conflict = issue(leader, group.getId(), direct(target, requestId, "다른 내용"));
        Response another = issue(leader, group.getId(), direct(target, UUID.randomUUID(), "함께해요"));

        // Then
        assertThat(first.statusCode()).isEqualTo(201);
        assertThat(retry.statusCode()).isEqualTo(200);
        assertThat(retry.jsonPath().getBoolean("data.reused")).isTrue();
        assertThat(retry.jsonPath().getLong("data.id")).isEqualTo(first.jsonPath().getLong("data.id"));
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(conflict.jsonPath().getString("error.code")).isEqualTo("INVITATION_REQUEST_CONFLICT");
        assertThat(another.statusCode()).isEqualTo(201);
        assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    @Test
    @DisplayName("모임원이 아닌 발급자·초대할 수 없는 대상·종료된 모임·잘못된 입력의 발급 요청은 거부하고 초대와 알림을 저장하지 않는다.")
    void invalidIssuanceDoesNotWriteRecords() {
        // Given
        Member leader = member("101");
        Member outsider = member("102");
        Member target = member("103");
        Member withdrawn = member("104");
        Group group = group(leader);
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, withdrawn.getId());

        // When / Then
        assertError(issue(outsider, group.getId(), direct(target, UUID.randomUUID(), null)), 403, "ACCESS_DENIED");
        assertError(issue(leader, group.getId(), direct(leader, UUID.randomUUID(), null)), 400, "INVALID_PARAMETER");
        groupMembers.save(GroupMember.createMember(group, target, NOW));
        assertError(issue(leader, group.getId(), direct(target, UUID.randomUUID(), null)), 409, "GROUP_MEMBER_ALREADY_EXISTS");
        assertError(issue(leader, group.getId(), direct(withdrawn, UUID.randomUUID(), null)), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "DIRECT", "targetMemberId", 999999, "requestId", UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), direct(outsider, UUID.randomUUID(), "가".repeat(201))), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "LINK", "targetMemberId", outsider.getId(), "requestId", UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "DIRECT", "requestId", UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "DIRECT", "targetMemberId", outsider.getId())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, -1, direct(outsider, UUID.randomUUID(), null)), 400, "INVALID_PARAMETER");
        assertError(issue(leader, 999999, direct(outsider, UUID.randomUUID(), null)), 404, "GROUP_NOT_FOUND");
        jdbc.update("update groups set status = 'ENDED' where id = ?", group.getId());
        assertError(issue(leader, group.getId(), direct(outsider, UUID.randomUUID(), null)), 409, "GROUP_ENDED");
        assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
    }

    @Test
    @DisplayName("초대 생성에는 회원 인증과 CSRF 검증이 필요하다.")
    void issuanceRequiresAuthenticationAndCsrf() {
        // Given
        Member leader = member("101");
        Group group = group(leader);
        Map<String, Object> request = direct(member("102"), UUID.randomUUID(), null);

        // When / Then
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        assertError(RestAssured.given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf).contentType("application/json").body(request)
                .post("/groups/{id}/invitations", group.getId()), 401, "UNAUTHENTICATED");
        assertError(auth(leader).contentType("application/json").body(request)
                .post("/groups/{id}/invitations", group.getId()), 403, "ACCESS_DENIED");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @DisplayName("모임장과 모임원이 발급한 공유 링크는 72시간 유효하고 재시도 시 같은 경로를 복원하며 알림을 만들지 않는다.")
    void linkIssuanceRestoresPathAndDoesNotNotify(boolean leaderIssues) {
        // Given
        Member leader = member("101");
        Member inviter = leaderIssues ? leader : member("102");
        Group group = group(leader);
        if (!leaderIssues) groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        Map<String, Object> request = Map.of("type", "LINK", "requestId", UUID.randomUUID());

        // When
        Response first = issue(inviter, group.getId(), request);
        Response retry = issue(inviter, group.getId(), request);
        Response another = issue(inviter, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID()));

        // Then
        assertThat(first.statusCode()).isEqualTo(201);
        assertThat(first.jsonPath().getString("data.expiresAt")).isEqualTo(NOW.plusDays(3).toString() + ":00");
        String path = first.jsonPath().getString("data.sharePath");
        assertThat(path).matches("/invitations/link/[A-Za-z0-9_-]{43}");
        assertThat(retry.statusCode()).isEqualTo(200);
        assertThat(retry.jsonPath().getString("data.sharePath")).isEqualTo(path);
        assertThat(another.statusCode()).isEqualTo(201);
        assertThat(another.jsonPath().getString("data.sharePath")).isNotEqualTo(path);
        assertThat(jdbc.queryForObject("select encrypted_token from invitation where id = ?", String.class,
                first.jsonPath().getLong("data.id"))).doesNotContain(path.substring(path.lastIndexOf('/') + 1));
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
        assertThat(auth(inviter).get("/invitations/received").jsonPath().getList("data.items")).isEmpty();
    }

    @Test
    @DisplayName("동시에 도착한 동일 발급 요청은 초대와 알림 및 구독별 전송 작업을 한 번만 만든다.")
    void concurrentRetriesCreateOneInvitationAndNotification() throws Exception {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        subscription(target, "one");
        Map<String, Object> request = direct(target, UUID.randomUUID(), null);

        // When
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Callable<Response>> tasks = IntStream.range(0, 6)
                    .mapToObj(index -> (Callable<Response>) () -> issue(leader, group.getId(), request)).toList();
            var responses = executor.invokeAll(tasks);

            // Then
            List<Integer> codes = responses.stream().map(future -> {
                try { return future.get().statusCode(); } catch (Exception exception) { throw new AssertionError(exception); }
            }).toList();
            assertThat(codes).containsOnly(201, 200);
            assertThat(codes.stream().filter(code -> code == 201).count()).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("동일 발급자의 requestId를 서로 다른 모임에서 동시에 사용하면 한 건만 생성하고 다른 요청은 충돌로 응답한다.")
    void concurrentCrossGroupRequestIdConflictDoesNotBecomeServerError() throws Exception {
        // Given
        Member inviter = member("101");
        Member target = member("102");
        Group first = group(inviter);
        Group second = groups.save(Group.createClub("다른 모임", "함께해요", null, null, null, NOW));
        groupMembers.save(GroupMember.createMember(second, inviter, NOW));
        Map<String, Object> request = direct(target, UUID.randomUUID(), null);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        // When
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Callable<Response>> tasks = List.of(first, second).stream().map(group -> (Callable<Response>) () -> {
                ready.countDown();
                start.await();
                return issue(inviter, group.getId(), request);
            }).toList();
            var firstResult = executor.submit(tasks.getFirst());
            var secondResult = executor.submit(tasks.getLast());
            ready.await();
            start.countDown();

            // Then
            assertThat(List.of(firstResult.get().statusCode(), secondResult.get().statusCode())).containsExactlyInAnyOrder(201, 409);
        }
        assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("회원 후보는 크루명으로 검색하고 본인·소속·탈퇴 회원을 제외하며 제한된 필드와 커서를 제공한다.")
    void candidatesAreRestrictedAndPaginatedWithoutSensitiveFields() {
        // Given
        Member leader = member("101");
        Group group = group(leader);
        Member current = member("102");
        groupMembers.save(GroupMember.createMember(group, current, NOW));
        Member first = member("103");
        Member second = member("104");
        Member withdrawn = member("105");
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, withdrawn.getId());

        // When
        Response page = auth(leader).queryParam("keyword", "  크루  ").queryParam("size", 1)
                .get("/groups/{id}/invitation-candidates", group.getId());

        // Then
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.header("Cache-Control")).contains("no-store");
        assertThat(page.jsonPath().getList("data.items.memberId", Long.class)).containsExactly(second.getId());
        assertThat(page.jsonPath().getMap("data.items[0]").keySet())
                .containsExactlyInAnyOrder("memberId", "crewName", "generation", "memberType", "course");
        assertThat(page.jsonPath().getBoolean("data.hasNext")).isTrue();
        Response last = auth(leader).queryParam("keyword", "크루").queryParam("size", 1)
                .queryParam("cursor", page.jsonPath().getString("data.nextCursor"))
                .get("/groups/{id}/invitation-candidates", group.getId());
        assertThat(last.jsonPath().getList("data.items.memberId", Long.class)).containsExactly(first.getId());
        assertThat(last.jsonPath().getBoolean("data.hasNext")).isFalse();
        assertThat(last.jsonPath().getString("data.nextCursor")).isNull();
        assertError(auth(first).queryParam("keyword", "크루").get("/groups/{id}/invitation-candidates", group.getId()), 403, "ACCESS_DENIED");
        for (String keyword : new String[]{"가", " ", "가".repeat(51)}) {
            assertError(auth(leader).queryParam("keyword", keyword).get("/groups/{id}/invitation-candidates", group.getId()), 400, "INVALID_PARAMETER");
        }
        assertError(auth(leader).queryParam("keyword", "크루").queryParam("cursor", "broken")
                .get("/groups/{id}/invitation-candidates", group.getId()), 400, "INVALID_PARAMETER");
        assertError(auth(leader).queryParam("keyword", "크루").queryParam("size", 101)
                .get("/groups/{id}/invitation-candidates", group.getId()), 400, "INVALID_PARAMETER");
        jdbc.update("update groups set status = 'ENDED' where id = ?", group.getId());
        assertError(auth(leader).queryParam("keyword", "크루").get("/groups/{id}/invitation-candidates", group.getId()), 409, "GROUP_ENDED");
    }

    @Test
    @DisplayName("받은 초대는 인증된 대상의 지정 초대만 반환하며 이력 상태와 커서 조회가 업무·읽음 상태를 바꾸지 않는다.")
    void receivedInvitationsAreOwnerScopedAndHaveCurrentStatusesWithoutSideEffects() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Member other = member("103");
        Group group = group(leader);
        Response first = issue(leader, group.getId(), direct(target, UUID.randomUUID(), "첫 초대"));
        Response second = issue(leader, group.getId(), direct(target, UUID.randomUUID(), "둘째 초대"));
        issue(leader, group.getId(), direct(other, UUID.randomUUID(), null));
        jdbc.update("update invitation set revoked_at = ? where id = ?", NOW, second.jsonPath().getLong("data.id"));

        // When
        Response page = auth(target).queryParam("size", 1).get("/invitations/received");

        // Then
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.header("Cache-Control")).contains("no-store");
        assertThat(page.jsonPath().getList("data.items.id", Long.class)).containsExactly(second.jsonPath().getLong("data.id"));
        assertThat(page.jsonPath().getString("data.items[0].status")).isEqualTo("REVOKED");
        assertThat(page.jsonPath().getBoolean("data.items[0].canRevoke")).isFalse();
        Response last = auth(target).queryParam("size", 1).queryParam("cursor", page.jsonPath().getString("data.nextCursor"))
                .get("/invitations/received");
        assertThat(last.jsonPath().getList("data.items.id", Long.class)).containsExactly(first.jsonPath().getLong("data.id"));
        assertThat(last.jsonPath().getBoolean("data.hasNext")).isFalse();
        jdbc.update("delete from group_member where group_id = ? and member_id = ?", group.getId(), leader.getId());
        Response expired = auth(target).get("/invitations/received");
        assertThat(expired.jsonPath().getString("data.items[1].status")).isEqualTo("EXPIRED");
        jdbc.update("update groups set status = 'ENDED' where id = ?", group.getId());
        Response ended = auth(target).get("/invitations/received");
        assertThat(ended.jsonPath().getString("data.items[0].status")).isEqualTo("REVOKED");
        assertThat(ended.jsonPath().getString("data.items[1].status")).isEqualTo("GROUP_ENDED");
        assertThat(auth(leader).get("/invitations/received").jsonPath().getList("data.items")).isEmpty();
        assertError(auth(target).queryParam("cursor", "broken").get("/invitations/received"), 400, "INVALID_PARAMETER");
        assertError(auth(target).queryParam("size", 0).get("/invitations/received"), 400, "INVALID_PARAMETER");
        assertError(RestAssured.get("/invitations/received"), 401, "UNAUTHENTICATED");
        assertThat(jdbc.queryForObject("select count(*) from notifications where read_at is not null", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"notifications", "notification_deliveries"})
    @DisplayName("알림 또는 전송 대기 저장 실패는 초대와 관련 알림 전체를 함께 롤백한다.")
    void notificationStorageFailureRollsBackInvitation(String table) {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        subscription(target, "one");
        jdbc.execute("create function invitation_test_fail() returns trigger language plpgsql as $$ begin raise exception 'write failure'; end; $$");
        jdbc.execute("create trigger invitation_test_fail before insert on " + table + " for each row execute function invitation_test_fail()");
        try {
            // When / Then
            assertError(issue(leader, group.getId(), direct(target, UUID.randomUUID(), null)), 500, "INTERNAL_ERROR");
            assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
        } finally {
            jdbc.execute("drop trigger invitation_test_fail on " + table);
            jdbc.execute("drop function invitation_test_fail()");
        }
    }

    private Group group(Member leader) {
        Group group = groups.save(Group.createClub("모임" + leader.getId(), "함께해요", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, leader, NOW));
        return group;
    }

    private RequestSpecification auth(Member member) {
        return RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(member.getId()).value());
    }

    private Response issue(Member member, long groupId, Map<String, Object> body) {
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        return auth(member).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .contentType("application/json").body(body).post("/groups/{id}/invitations", groupId);
    }

    private Map<String, Object> direct(Member target, UUID requestId, String message) {
        Map<String, Object> request = new HashMap<>();
        request.put("type", "DIRECT");
        request.put("targetMemberId", target.getId());
        request.put("requestId", requestId);
        request.put("message", message);
        return request;
    }

    private void assertError(Response response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo(code);
    }
}
