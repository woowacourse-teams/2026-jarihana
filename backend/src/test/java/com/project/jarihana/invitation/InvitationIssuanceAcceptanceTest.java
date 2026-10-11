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
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.Base64;
import java.security.SecureRandom;
import java.sql.Timestamp;
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
        Response response = issue(inviter, group.getId(), direct(target, UUID.randomUUID()));

        // Then
        assertThat(response.statusCode()).isEqualTo(201);
        long id = response.jsonPath().getLong("data.id");
        assertThat(response.header("Cache-Control")).contains("no-store");
        assertThat(response.jsonPath().getMap("data")).doesNotContainKey("message");
        assertThat(response.jsonPath().getString("data.sharePath")).isEqualTo("/invitations/" + id);
        assertThat(response.jsonPath().getString("data.status")).isEqualTo("ACTIVE");
        assertThat(response.jsonPath().getString("data.expiresAt")).isNull();
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(target.getId());
        assertThat(jdbc.queryForObject("select event_type from notifications", String.class)).isEqualTo("INVITATION_RECEIVED");
        assertThat(jdbc.queryForObject("select payload ->> 'invitationId' from notifications", Long.class)).isEqualTo(id);
        assertThat(jdbc.queryForObject("select payload::text from notifications", String.class))
                .doesNotContain("recruitmentId", "registrationId", "message", "token");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from registration", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
    }

    @Test
    @DisplayName("같은 requestId로 다시 요청하면 같은 대상의 기존 초대를 반환하고, 대상이 다르면 거부하며 새 requestId면 초대와 알림을 새로 만든다.")
    void retryReusesInvitationAndNewRequestCreatesAnotherInboxWithoutSubscription() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        UUID requestId = UUID.randomUUID();
        Response first = issue(leader, group.getId(), direct(target, requestId));

        // When
        Response retry = issue(leader, group.getId(), direct(target, requestId));
        Response conflict = issue(leader, group.getId(), direct(member("103"), requestId));
        Response another = issue(leader, group.getId(), direct(target, UUID.randomUUID()));

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
        assertError(issue(outsider, group.getId(), direct(target, UUID.randomUUID())), 403, "ACCESS_DENIED");
        assertError(issue(leader, group.getId(), direct(leader, UUID.randomUUID())), 400, "INVALID_PARAMETER");
        groupMembers.save(GroupMember.createMember(group, target, NOW));
        assertError(issue(leader, group.getId(), direct(target, UUID.randomUUID())), 409, "GROUP_MEMBER_ALREADY_EXISTS");
        assertError(issue(leader, group.getId(), direct(withdrawn, UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "DIRECT", "targetMemberId", 999999, "requestId", UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "DIRECT", "targetMemberId", outsider.getId(), "requestId", "invalid-uuid")), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "LINK", "targetMemberId", outsider.getId(), "requestId", UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "DIRECT", "requestId", UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, group.getId(), Map.of("type", "DIRECT", "targetMemberId", outsider.getId())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, -1, direct(outsider, UUID.randomUUID())), 400, "INVALID_PARAMETER");
        assertError(issue(leader, 999999, direct(outsider, UUID.randomUUID())), 404, "GROUP_NOT_FOUND");
        jdbc.update("update groups set status = 'ENDED' where id = ?", group.getId());
        assertError(issue(leader, group.getId(), direct(outsider, UUID.randomUUID())), 409, "GROUP_ENDED");
        assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
    }

    @Test
    @DisplayName("초대 생성에는 회원 인증과 CSRF 검증이 필요하다.")
    void issuanceRequiresAuthenticationAndCsrf() {
        // Given
        Member leader = member("101");
        Group group = group(leader);
        Map<String, Object> request = direct(member("102"), UUID.randomUUID());

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
        Map<String, Object> request = direct(target, UUID.randomUUID());

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
        Map<String, Object> request = direct(target, UUID.randomUUID());
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
        Response first = issue(leader, group.getId(), direct(target, UUID.randomUUID()));
        Response second = issue(leader, group.getId(), direct(target, UUID.randomUUID()));
        issue(leader, group.getId(), direct(other, UUID.randomUUID()));
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
            assertError(issue(leader, group.getId(), direct(target, UUID.randomUUID())), 500, "INTERNAL_ERROR");
            assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
        } finally {
            jdbc.execute("drop trigger invitation_test_fail on " + table);
            jdbc.execute("drop function invitation_test_fail()");
        }
    }

    @Test
    @DisplayName("지정 초대 상세는 발급자와 대상만 조회하며 모임장도 타인의 지정 초대 정보를 볼 수 없다.")
    void directDetailProtectsTargetAndMessage() {
        // Given
        Member leader = member("101");
        Member inviter = member("102");
        Member target = member("103");
        Member outsider = member("104");
        Group group = group(leader);
        groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        long id = issue(inviter, group.getId(), direct(target, UUID.randomUUID())).jsonPath().getLong("data.id");

        // When
        Response targetDetail = auth(target).get("/invitations/{id}", id);
        Response inviterDetail = auth(inviter).get("/invitations/{id}", id);

        // Then
        assertThat(targetDetail.statusCode()).isEqualTo(200);
        assertThat(targetDetail.header("Cache-Control")).contains("no-store");
        assertThat(targetDetail.jsonPath().getMap("data")).doesNotContainKey("message");
        assertThat(targetDetail.jsonPath().getBoolean("data.canAccept")).isTrue();
        assertThat(targetDetail.jsonPath().getBoolean("data.canRevoke")).isFalse();
        assertThat(targetDetail.jsonPath().getString("data.group.introduction")).isEqualTo("함께해요");
        assertThat(inviterDetail.jsonPath().getBoolean("data.canAccept")).isFalse();
        assertThat(inviterDetail.jsonPath().getBoolean("data.canRevoke")).isTrue();
        assertThat(inviterDetail.jsonPath().getString("data.sharePath")).isEqualTo("/invitations/" + id);
        assertError(auth(leader).get("/invitations/{id}", id), 403, "INVITATION_ACCESS_DENIED");
        assertError(auth(outsider).get("/invitations/{id}", id), 403, "INVITATION_ACCESS_DENIED");
        assertError(auth(target).get("/invitations/999999"), 404, "INVITATION_NOT_FOUND");
        assertError(auth(target).get("/invitations/0"), 400, "INVALID_PARAMETER");
        assertError(RestAssured.get("/invitations/{id}", id), 401, "UNAUTHENTICATED");
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from registration", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications where read_at is not null", Integer.class)).isZero();
    }

    @Test
    @DisplayName("공유 링크는 비회원도 미리보기만 볼 수 있고 모든 현재 모임원은 다른 사람이 발급한 원래 링크를 다시 복사할 수 있다.")
    void publicLinkPreviewAndAuthorizedRecopyDoNotExtendExpiry() {
        // Given
        Member leader = member("101");
        Member inviter = member("102");
        Member other = member("103");
        Group group = group(leader);
        groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        groupMembers.save(GroupMember.createMember(group, other, NOW));
        Response issued = issue(inviter, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID()));
        long id = issued.jsonPath().getLong("data.id");
        String path = issued.jsonPath().getString("data.sharePath");
        String token = path.substring(path.lastIndexOf('/') + 1);

        // When
        Response preview = RestAssured.get("/invitations/links/{token}", token);
        Response detail = auth(leader).get("/invitations/{id}", id);

        // Then
        assertThat(preview.statusCode()).isEqualTo(200);
        assertThat(preview.header("Cache-Control")).contains("no-store");
        assertThat(preview.jsonPath().getBoolean("data.canAccept")).isTrue();
        assertThat(preview.jsonPath().getMap("data")).doesNotContainKey("message");
        assertThat(preview.jsonPath().getMap("data").keySet()).containsExactlyInAnyOrder(
                "id", "type", "group", "inviter", "createdAt", "expiresAt", "status", "canAccept");
        assertThat(preview.asString()).doesNotContain(token, "tokenHash", "encryptedToken", "targetMember");
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.sharePath")).isEqualTo(path);
        assertThat(detail.jsonPath().getString("data.expiresAt")).isEqualTo(issued.jsonPath().getString("data.expiresAt"));
        assertThat(detail.jsonPath().getBoolean("data.canAccept")).isFalse();
        assertThat(detail.jsonPath().getBoolean("data.canRevoke")).isTrue();
        assertThat(auth(inviter).get("/invitations/{id}", id).jsonPath().getString("data.sharePath")).isEqualTo(path);
        Response otherDetail = auth(other).get("/invitations/{id}", id);
        assertThat(otherDetail.statusCode()).isEqualTo(200);
        assertThat(otherDetail.jsonPath().getString("data.sharePath")).isEqualTo(path);
        assertThat(otherDetail.jsonPath().getBoolean("data.canRevoke")).isFalse();
        assertThat(otherDetail.jsonPath().getString("data.expiresAt")).isEqualTo(issued.jsonPath().getString("data.expiresAt"));
        assertError(revoke(other, id), 403, "ACCESS_DENIED");
        jdbc.update("delete from group_member where group_id = ? and member_id = ?", group.getId(), other.getId());
        assertError(auth(other).get("/invitations/{id}", id), 404, "INVITATION_NOT_FOUND");
        groupMembers.save(GroupMember.createMember(group, other, NOW));
        assertError(RestAssured.get("/invitations/links/invalid"), 400, "INVALID_PARAMETER");
        assertError(RestAssured.get("/invitations/links/" + "A".repeat(43)), 404, "INVITATION_NOT_FOUND");
        assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from group_member", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
    }

    @ParameterizedTest
    @CsvSource({"1,ACTIVE,true", "0,EXPIRED,false", "-1,EXPIRED,false"})
    @DisplayName("공유 링크의 상세와 공개 미리보기는 만료 전까지 수락 가능하며 만료 정각과 이후에는 만료로 안내한다.")
    void linkViewsRespectExpiryBoundary(int secondsUntilExpiry, String status, boolean canAccept) {
        // Given
        Member leader = member("101");
        Group group = group(leader);
        Response issued = issue(leader, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID()));
        long id = issued.jsonPath().getLong("data.id");
        String path = issued.jsonPath().getString("data.sharePath");
        String token = path.substring(path.lastIndexOf('/') + 1);
        jdbc.update("update invitation set expires_at = ? where id = ?", NOW.plusSeconds(secondsUntilExpiry), id);

        // When
        Response preview = RestAssured.get("/invitations/links/{token}", token);
        Response detail = auth(leader).get("/invitations/{id}", id);

        // Then
        assertThat(preview.statusCode()).isEqualTo(200);
        assertThat(preview.jsonPath().getString("data.status")).isEqualTo(status);
        assertThat(preview.jsonPath().getBoolean("data.canAccept")).isEqualTo(canAccept);
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.status")).isEqualTo(status);
        assertThat(detail.jsonPath().getString("data.sharePath")).isEqualTo(path);
    }

    @Test
    @DisplayName("본인 발급 목록은 두 유형을 보여주고 모든 모임원이 조회하는 공유 링크 목록은 지정 초대를 제외한다.")
    void issuedListsEnforceScopeAndCursorPrivacy() {
        // Given
        Member leader = member("101");
        Member inviter = member("102");
        Member target = member("103");
        Group group = group(leader);
        groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        long directId = issue(inviter, group.getId(), direct(target, UUID.randomUUID())).jsonPath().getLong("data.id");
        long linkId = issue(inviter, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID()))
                .jsonPath().getLong("data.id");
        long leaderLink = issue(leader, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID()))
                .jsonPath().getLong("data.id");

        // When
        Response first = auth(inviter).queryParam("size", 1).get("/groups/{id}/invitations", group.getId());
        String cursor = first.jsonPath().getString("data.nextCursor");
        Response next = auth(inviter).queryParam("size", 1).queryParam("cursor", cursor).get("/groups/{id}/invitations", group.getId());
        Response managed = auth(leader).queryParam("scope", "MANAGED_LINKS").get("/groups/{id}/invitations", group.getId());

        // Then
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(first.jsonPath().getLong("data.items[0].id")).isEqualTo(linkId);
        assertThat(first.jsonPath().getBoolean("data.hasNext")).isTrue();
        assertThat(first.jsonPath().getMap("data.items[0]")).doesNotContainKey("message");
        assertThat(next.jsonPath().getLong("data.items[0].id")).isEqualTo(directId);
        assertThat(next.jsonPath().getBoolean("data.hasNext")).isFalse();
        assertThat(next.jsonPath().getString("data.nextCursor")).isNull();
        assertThat(managed.statusCode()).isEqualTo(200);
        assertThat(managed.jsonPath().getList("data.items.id", Long.class)).containsExactly(leaderLink, linkId);
        assertThat(managed.jsonPath().getMap("data.items[1]")).doesNotContainKey("message");
        assertThat(managed.asString()).doesNotContain("message", "sharePath", "tokenHash", "encryptedToken");
        Response memberLinks = auth(inviter).queryParam("scope", "MANAGED_LINKS").get("/groups/{id}/invitations", group.getId());
        assertThat(memberLinks.statusCode()).isEqualTo(200);
        assertThat(memberLinks.jsonPath().getList("data.items.id", Long.class)).containsExactly(leaderLink, linkId);
        assertThat(memberLinks.jsonPath().getBoolean("data.items[0].canRevoke")).isFalse();
        assertThat(memberLinks.jsonPath().getBoolean("data.items[1].canRevoke")).isTrue();
        assertThat(memberLinks.jsonPath().getMap("data.items[0]")).doesNotContainKey("message");
        assertError(auth(inviter).queryParam("scope", "MANAGED_LINKS").queryParam("cursor", cursor)
                .get("/groups/{id}/invitations", group.getId()), 400, "INVALID_PARAMETER");
        assertError(auth(target).get("/groups/{id}/invitations", group.getId()), 403, "ACCESS_DENIED");
        assertError(auth(leader).queryParam("cursor", cursor).get("/groups/{id}/invitations", group.getId()), 400, "INVALID_PARAMETER");
        assertError(auth(leader).queryParam("scope", "OTHER").get("/groups/{id}/invitations", group.getId()), 400, "INVALID_PARAMETER");
        assertError(auth(leader).queryParam("size", 101).get("/groups/{id}/invitations", group.getId()), 400, "INVALID_PARAMETER");
    }

    @ParameterizedTest
    @CsvSource({"DIRECT,issuer,true", "DIRECT,leader,false", "DIRECT,target,false", "DIRECT,other,false",
            "LINK,issuer,true", "LINK,leader,true", "LINK,target,false", "LINK,other,false"})
    @DisplayName("지정 초대는 발급자만 취소하고 공유 링크는 발급자와 현재 모임장만 취소한다.")
    void revokeChecksPermissionsByInvitationType(String type, String actorRole, boolean allowed) {
        // Given
        Member leader = member("101");
        Member inviter = member("102");
        Member target = member("103");
        Member other = member("104");
        Group group = group(leader);
        groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        groupMembers.save(GroupMember.createMember(group, other, NOW));
        Map<String, Object> request = type.equals("DIRECT") ? direct(target, UUID.randomUUID())
                : Map.of("type", "LINK", "requestId", UUID.randomUUID());
        long id = issue(inviter, group.getId(), request).jsonPath().getLong("data.id");
        Member actor = Map.of("issuer", inviter, "leader", leader, "target", target, "other", other).get(actorRole);

        // When
        Response response = revoke(actor, id);

        // Then
        assertThat(response.statusCode()).isEqualTo(allowed ? 200 : 403);
        if (allowed) {
            assertThat(response.jsonPath().getString("data.status")).isEqualTo("REVOKED");
            assertThat(response.jsonPath().getString("data.revokedAt")).isEqualTo(NOW.toString() + ":00");
        } else {
            assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
            assertThat(jdbc.queryForObject("select revoked_at from invitation where id = ?", Timestamp.class, id)).isNull();
        }
        assertThat(jdbc.queryForObject("select count(*) from group_member", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
    }

    @Test
    @DisplayName("초대를 취소하면 미전송 푸시만 취소하고 알림함과 이미 전송된 기록은 유지하며 재취소는 최초 시각을 반환한다.")
    void revokeCancelsOutstandingDeliveriesAndPreservesOriginalTime() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        for (String suffix : List.of("pending", "retry", "inflight", "accepted", "failed")) subscription(target, suffix);
        long id = issue(leader, group.getId(), direct(target, UUID.randomUUID())).jsonPath().getLong("data.id");
        var ids = jdbc.queryForList("select id from notification_deliveries order by id", Long.class);
        jdbc.update("update notification_deliveries set status = 'RETRY', attempt_count = 1 where id = ?", ids.get(1));
        jdbc.update("update notification_deliveries set status = 'IN_FLIGHT', attempt_count = 1, lease_token = ?, locked_until = ? where id = ?", UUID.randomUUID(), NOW.plusMinutes(1), ids.get(2));
        jdbc.update("update notification_deliveries set status = 'ACCEPTED', attempt_count = 1, accepted_at = ? where id = ?", NOW, ids.get(3));
        jdbc.update("update notification_deliveries set status = 'FAILED' where id = ?", ids.get(4));

        // When
        Response first = revoke(leader, id);
        jdbc.update("update invitation set revoked_at = ? where id = ?", NOW.minusMinutes(1), id);
        Response retry = revoke(leader, id);

        // Then
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(retry.statusCode()).isEqualTo(200);
        assertThat(retry.jsonPath().getString("data.revokedAt")).isEqualTo(NOW.minusMinutes(1).toString() + ":00");
        assertThat(jdbc.queryForList("select status from notification_deliveries order by id", String.class))
                .containsExactly("CANCELLED", "CANCELLED", "CANCELLED", "ACCEPTED", "FAILED");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where lease_token is not null", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications where deleted_at is null and read_at is null", Integer.class)).isEqualTo(1);
        assertThat(auth(target).get("/invitations/{id}", id).jsonPath().getString("data.status")).isEqualTo("REVOKED");
        assertThat(auth(target).get("/invitations/{id}", id).jsonPath().getBoolean("data.canAccept")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"DIRECT", "LINK"})
    @DisplayName("발급자가 모임을 이탈하면 두 유형 모두 만료로 안내하고 링크 재복사와 취소 권한도 사라진다.")
    void issuerDepartureExpiresInvitationsAndRemovesManagementRights(String type) {
        // Given
        Member leader = member("101");
        Member inviter = member("102");
        Member target = member("103");
        Group group = group(leader);
        groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        Response issued = issue(inviter, group.getId(), type.equals("DIRECT") ? direct(target, UUID.randomUUID())
                : Map.of("type", "LINK", "requestId", UUID.randomUUID()));
        long id = issued.jsonPath().getLong("data.id");
        jdbc.update("delete from group_member where group_id = ? and member_id = ?", group.getId(), inviter.getId());

        // When
        Response detail = auth(inviter).get("/invitations/{id}", id);

        // Then
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.status")).isEqualTo("EXPIRED");
        assertThat(detail.jsonPath().getBoolean("data.canAccept")).isFalse();
        assertThat(detail.jsonPath().getBoolean("data.canRevoke")).isFalse();
        if (type.equals("LINK")) assertThat(detail.jsonPath().getString("data.sharePath")).isNull();
        assertError(revoke(inviter, id), 403, "ACCESS_DENIED");
        assertThat(auth(leader).queryParam("scope", type.equals("LINK") ? "MANAGED_LINKS" : "MINE")
                .get("/groups/{id}/invitations", group.getId()).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("종료된 모임의 초대는 이력 조회만 가능하며 취소 요청은 거부하고 인증과 CSRF 없는 변경도 차단한다.")
    void endedGroupAndRevokeAuthenticationDoNotModifyInvitations() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        long id = issue(leader, group.getId(), direct(target, UUID.randomUUID())).jsonPath().getLong("data.id");

        // When
        Response withoutCsrf = auth(leader).patch("/invitations/{id}/revoke", id);
        jdbc.update("update groups set status = 'ENDED' where id = ?", group.getId());
        Response detail = auth(target).get("/invitations/{id}", id);

        // Then
        assertError(withoutCsrf, 403, "ACCESS_DENIED");
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getString("data.status")).isEqualTo("GROUP_ENDED");
        assertThat(detail.jsonPath().getBoolean("data.canAccept")).isFalse();
        assertError(revoke(leader, id), 409, "GROUP_ENDED");
        assertError(revoke(leader, 999999), 404, "INVITATION_NOT_FOUND");
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        assertError(RestAssured.given().cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .patch("/invitations/{id}/revoke", id), 401, "UNAUTHENTICATED");
        assertThat(jdbc.queryForObject("select count(*) from invitation where revoked_at is not null", Integer.class)).isZero();
    }

    @Test
    @DisplayName("모임장 위임 후에도 모임원은 공유 링크를 조회할 수 있지만 타인의 공유 링크 취소 권한은 새 모임장에게만 있다.")
    void linkManagementFollowsCurrentLeadershipAndCursorScope() {
        // Given
        Member leader = member("101");
        Member inviter = member("102");
        Member successor = member("103");
        Group group = group(leader);
        groupMembers.save(GroupMember.createMember(group, inviter, NOW));
        groupMembers.save(GroupMember.createMember(group, successor, NOW));
        long id = issue(inviter, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID())).jsonPath().getLong("data.id");
        issue(inviter, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID()));
        String cursor = auth(leader).queryParam("scope", "MANAGED_LINKS").queryParam("size", 1)
                .get("/groups/{id}/invitations", group.getId()).jsonPath().getString("data.nextCursor");

        // When
        jdbc.update("update group_member set role = 'MEMBER' where group_id = ? and member_id = ?", group.getId(), leader.getId());
        jdbc.update("update group_member set role = 'LEADER' where group_id = ? and member_id = ?", group.getId(), successor.getId());

        // Then
        Response formerLeaderDetail = auth(leader).get("/invitations/{id}", id);
        assertThat(formerLeaderDetail.statusCode()).isEqualTo(200);
        assertThat(formerLeaderDetail.jsonPath().getString("data.sharePath")).startsWith("/invitations/link/");
        assertThat(formerLeaderDetail.jsonPath().getBoolean("data.canRevoke")).isFalse();
        assertError(revoke(leader, id), 403, "ACCESS_DENIED");
        assertThat(auth(successor).get("/invitations/{id}", id).jsonPath().getBoolean("data.canRevoke")).isTrue();
        assertError(auth(successor).queryParam("scope", "MANAGED_LINKS").queryParam("cursor", cursor)
                .get("/groups/{id}/invitations", group.getId()), 400, "INVALID_PARAMETER");
        assertThat(revoke(successor, id).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("공유 초대의 취소·모임 종료·발급자 탈퇴 상태는 공개 미리보기에서도 수락 불가로 안내하며 삭제된 초대는 찾을 수 없다.")
    void publicPreviewReportsInvalidStatesWithoutChangingRecords() {
        // Given
        Member leader = member("101");
        Group group = group(leader);
        Response issued = issue(leader, group.getId(), Map.of("type", "LINK", "requestId", UUID.randomUUID()));
        long id = issued.jsonPath().getLong("data.id");
        String path = issued.jsonPath().getString("data.sharePath");
        String token = path.substring(path.lastIndexOf('/') + 1);

        // When
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, leader.getId());
        Response withdrawn = RestAssured.get("/invitations/links/{token}", token);
        jdbc.update("update groups set status = 'ENDED' where id = ?", group.getId());
        Response ended = RestAssured.get("/invitations/links/{token}", token);
        jdbc.update("update invitation set revoked_at = ? where id = ?", NOW, id);
        Response revoked = RestAssured.get("/invitations/links/{token}", token);
        jdbc.update("delete from invitation where id = ?", id);
        jdbc.update("delete from group_member where group_id = ?", group.getId());
        jdbc.update("delete from groups where id = ?", group.getId());

        // Then
        for (Response response : List.of(withdrawn, ended, revoked)) {
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.jsonPath().getBoolean("data.canAccept")).isFalse();
        }
        assertThat(withdrawn.jsonPath().getString("data.status")).isEqualTo("EXPIRED");
        assertThat(ended.jsonPath().getString("data.status")).isEqualTo("GROUP_ENDED");
        assertThat(revoked.jsonPath().getString("data.status")).isEqualTo("REVOKED");
        assertError(RestAssured.get("/invitations/links/{token}", token), 404, "INVITATION_NOT_FOUND");
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
    }

    @Test
    @DisplayName("지정 초대에는 시간 만료가 없으며 이미 수락한 초대를 취소해도 기존 구성원과 수락 이력을 유지한다.")
    void directAcceptanceHistorySurvivesRevocationWithoutTimeExpiry() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        long id = issue(leader, group.getId(), direct(target, UUID.randomUUID())).jsonPath().getLong("data.id");
        jdbc.update("update invitation set created_at = ? where id = ?", NOW.minusYears(1), id);
        assertThat(auth(target).get("/invitations/{id}", id).jsonPath().getString("data.status")).isEqualTo("ACTIVE");
        groupMembers.save(GroupMember.createMember(group, target, NOW));
        jdbc.update("insert into invitation_acceptance (invitation_id, member_id, accepted_at, created_at, updated_at) values (?, ?, ?, ?, ?)",
                id, target.getId(), NOW, NOW, NOW);

        // When
        Response accepted = auth(target).get("/invitations/{id}", id);
        Response revoked = revoke(leader, id);

        // Then
        assertThat(accepted.jsonPath().getString("data.status")).isEqualTo("ACCEPTED");
        assertThat(accepted.jsonPath().getBoolean("data.canAccept")).isFalse();
        assertThat(revoked.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from group_member", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select created_at from invitation where id = ?", Timestamp.class, id).toLocalDateTime()).isEqualTo(NOW.minusYears(1));
    }

    @Test
    @DisplayName("동시에 같은 초대를 취소해도 최초 취소 시각 하나를 반환하고 초대와 미전송 푸시의 취소가 함께 반영된다.")
    void concurrentRevocationIsIdempotent() throws Exception {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        subscription(target, "one");
        long id = issue(leader, group.getId(), direct(target, UUID.randomUUID())).jsonPath().getLong("data.id");
        CountDownLatch start = new CountDownLatch(1);

        // When
        try (var executor = Executors.newFixedThreadPool(4)) {
            List<Callable<Response>> calls = IntStream.range(0, 4).mapToObj(index -> (Callable<Response>) () -> {
                start.await();
                return revoke(leader, id);
            }).toList();
            var futures = calls.stream().map(executor::submit).toList();
            start.countDown();

            // Then
            for (var future : futures) {
                Response response = future.get();
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(response.jsonPath().getString("data.revokedAt")).isEqualTo(NOW.toString() + ":00");
            }
        }
        assertThat(jdbc.queryForObject("select count(*) from invitation where revoked_at is not null", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from notification_deliveries", String.class)).isEqualTo("CANCELLED");
    }

    @Test
    @DisplayName("미전송 푸시 취소 저장이 실패하면 초대 취소도 롤백하여 두 상태가 서로 어긋나지 않는다.")
    void deliveryCancellationFailureRollsBackRevocation() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        subscription(target, "one");
        long id = issue(leader, group.getId(), direct(target, UUID.randomUUID())).jsonPath().getLong("data.id");
        jdbc.execute("create function invitation_revoke_fail() returns trigger language plpgsql as $$ begin raise exception 'write failure'; end; $$");
        jdbc.execute("create trigger invitation_revoke_fail before update on notification_deliveries for each row execute function invitation_revoke_fail()");
        try {
            // When
            Response response = revoke(leader, id);

            // Then
            assertError(response, 500, "INTERNAL_ERROR");
            assertThat(jdbc.queryForObject("select revoked_at from invitation where id = ?", Timestamp.class, id)).isNull();
            assertThat(jdbc.queryForObject("select status from notification_deliveries", String.class)).isEqualTo("PENDING");
        } finally {
            jdbc.execute("drop trigger invitation_revoke_fail on notification_deliveries");
            jdbc.execute("drop function invitation_revoke_fail()");
        }
    }

    @Test
    @DisplayName("초대에는 개인 메시지가 없고 대상이 알림을 삭제해도 초대와 수락 가능 상태는 유지하며 거절 이력을 만들지 않는다.")
    void invitationHasNoMessageAndDeletingNotificationDoesNotRejectIt() {
        // Given
        Member leader = member("101");
        Member target = member("102");
        Group group = group(leader);
        subscription(target, "one");
        Response issued = issue(leader, group.getId(), Map.of("type", "DIRECT", "targetMemberId", target.getId(), "requestId", UUID.randomUUID()));
        long id = issued.jsonPath().getLong("data.id");
        long notificationId = jdbc.queryForObject("select id from notifications", Long.class);

        // When
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        Response deleted = auth(target).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .delete("/notifications/{id}", notificationId);
        Response detail = auth(target).get("/invitations/{id}", id);
        Response received = auth(target).get("/invitations/received");
        Response issuedList = auth(leader).get("/groups/{id}/invitations", group.getId());

        // Then
        assertThat(issued.statusCode()).isEqualTo(201);
        assertThat(issued.jsonPath().getMap("data")).doesNotContainKey("message");
        assertThat(deleted.statusCode()).isEqualTo(204);
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.jsonPath().getMap("data")).doesNotContainKey("message");
        assertThat(detail.jsonPath().getString("data.status")).isEqualTo("ACTIVE");
        assertThat(detail.jsonPath().getBoolean("data.canAccept")).isTrue();
        assertThat(received.jsonPath().getMap("data.items[0]")).doesNotContainKey("message");
        assertThat(received.jsonPath().getString("data.items[0].status")).isEqualTo("ACTIVE");
        assertThat(issuedList.jsonPath().getMap("data.items[0]")).doesNotContainKey("message");
        assertThat(auth(target).get("/notifications").jsonPath().getList("data.items")).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from invitation_acceptance", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from group_member", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from notification_deliveries", String.class)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = current_schema() and table_name = 'invitation' and column_name = 'message'", Integer.class)).isZero();
    }

    private Response revoke(Member member, long invitationId) {
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        return auth(member).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .patch("/invitations/{id}/revoke", invitationId);
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

    private Map<String, Object> direct(Member target, UUID requestId) {
        Map<String, Object> request = new HashMap<>();
        request.put("type", "DIRECT");
        request.put("targetMemberId", target.getId());
        request.put("requestId", requestId);
        return request;
    }

    private void assertError(Response response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo(code);
    }
}
