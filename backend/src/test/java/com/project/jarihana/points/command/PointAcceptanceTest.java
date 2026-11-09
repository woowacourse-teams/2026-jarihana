package com.project.jarihana.points.command;

import com.project.jarihana.points.command.service.PointRewardService;
import com.project.jarihana.points.command.service.PointRewardWorker;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;
import com.project.jarihana.points.config.PointPolicy;
import com.project.jarihana.points.domain.PointReward;
import com.project.jarihana.points.domain.PointReward.SkipReason;
import com.project.jarihana.points.domain.PointRewardRule;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.SignupSessionFixture;
import io.restassured.specification.RequestSpecification;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.LongStream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static com.project.jarihana.support.TestSupportConfig.FIXED_NOW;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

@TestPropertySource(properties = {
        "jarihana.points.starts-at=2026-08-01T00:00:00",
        "jarihana.points.poll-delay=3600000",
        "jarihana.points.signup-backfill-delay=3600000"
})
@Import(PointAcceptanceTest.ExtraRewardRules.class)
class PointAcceptanceTest extends IntegrationTestSupport {
    private static final String POINTS = "/members/me/points";
    private static final String GOMOKU_ROOMS = "/games/gomoku/rooms";
    @Autowired private PointRewardService rewards;
    @Autowired private PointRewardWorker worker;
    @Autowired private TransactionTemplate transaction;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private MemberRepository members;
    @Autowired private GroupCommandRepository groups;
    @Autowired private GroupMemberCommandRepository memberships;
    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;
    @Autowired private SignupSessionFixture signupSession;
    @Autowired private PointRewardRule challengeClearReward;
    @Autowired private WorkerAdmissionController admission;

    @DisplayName("서비스 가입을 완료하면 신규 회원에게 가입 보상 200P를 예약한다.")
    @Test
    void awardsSignupPointsToNewMember() {
        // Given
        String sessionId = signupSession.create("21001");
        String csrf = given().get("/members/me").cookie("XSRF-TOKEN");

        // When
        long memberId = given().contentType("application/json")
                .cookie("SESSION", signupSession.cookieValue(sessionId))
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .body(Map.of("crewName", "가온"))
                .post("/members").then().statusCode(201).extract().jsonPath().getLong("data.id");

        // Then
        request(memberId).get(POINTS).then().statusCode(200)
                .body("data.processing", equalTo(true)).body("data.balance", equalTo(0));
        worker.backfillSignupRewards();
        worker.processDue();
        request(memberId).get(POINTS).then().statusCode(200).body("data.balance", equalTo(200));
        request(memberId).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.reason", equalTo(List.of("MEMBER_SIGNUP")));
    }

    @DisplayName("모임 소속이나 로그인 없이 기존 회원의 가입 보상 200P를 한 번만 지급한다.")
    @Test
    void backfillsSignupPointsOnceForExistingMember() throws Exception {
        // Given
        long memberId = member("가온", "21001").getId();
        long withdrawnId = member("해솔", "21002").getId();
        jdbc.update("update member set withdrawn_at = ? where id = ?", FIXED_NOW, withdrawnId);
        assertThat(jdbc.queryForObject("select count(*) from point_wallet", Long.class)).isZero();

        // When
        CompletableFuture.allOf(
                CompletableFuture.runAsync(worker::backfillSignupRewards),
                CompletableFuture.runAsync(worker::backfillSignupRewards)
        ).get(10, TimeUnit.SECONDS);
        worker.processDue();
        worker.backfillSignupRewards();
        worker.processDue();

        // Then
        request(memberId).get(POINTS).then().statusCode(200).body("data.balance", equalTo(200));
        request(memberId).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.reason", equalTo(List.of("MEMBER_SIGNUP")))
                .body("data.items.label", equalTo(List.of("서비스 가입")));
        assertThat(jdbc.queryForObject("select count(*) from point_wallet where member_id = ?", Long.class, withdrawnId))
                .isZero();
    }

    @Test
    @DisplayName("배포로 중지된 동안 지급과 가입 보상 예약을 멈추고 재개 후 처리한다.")
    void pausesAndResumesPointWorkerWithDeploymentControl() {
        long memberId = member("가온", "21001").getId();
        transaction.executeWithoutResult(status -> rewards.gomokuWon(1, memberId, true, FIXED_NOW));

        admission.pause();
        try {
            worker.backfillSignupRewards();
            worker.processDue();
            assertThat(admission.drainStatus().isDrained()).isTrue();
            request(memberId).get(POINTS).then().statusCode(200).body("data.balance", equalTo(0));
            assertThat(jdbc.queryForObject("select count(*) from point_reward where reason = 'MEMBER_SIGNUP'", Long.class))
                    .isZero();
        } finally {
            admission.resume();
        }

        worker.backfillSignupRewards();
        worker.processDue();
        request(memberId).get(POINTS).then().statusCode(200).body("data.balance", equalTo(250));
    }

    @DisplayName("등록한 보상 규칙은 지급 조건, 금액, 주간 한도와 조회에 공통 흐름을 사용한다.")
    @Test
    void processesAnAdditionalRewardRuleThroughSharedFlow() {
        // Given
        long member = member("가온", "21001").getId();
        PointRewardRule rule = challengeClearReward;

        // When
        transaction.executeWithoutResult(status -> {
            rewards.register(PointReward.of(rule, member, "challenge:1", null, FIXED_NOW, SkipReason.INELIGIBLE));
            rewards.register(new PointReward(member, rule, "challenge:2", null, FIXED_NOW, 10, null));
            rewards.register(new PointReward(member, rule, "challenge:2", null, FIXED_NOW, 100, null));
            rewards.register(PointReward.of(rule, member, "challenge:3", FIXED_NOW));
            rewards.register(PointReward.of(rule, member, "challenge:4", FIXED_NOW));
        });

        // Then
        String quota = "data.weeklyQuotas.find { it.reason == 'TEST_CHALLENGE_CLEAR' }";
        request(member).get(POINTS).then().statusCode(200)
                .body("data.balance", equalTo(0))
                .body(quota + ".label", equalTo("테스트 챌린지"))
                .body(quota + ".quota.pending", equalTo(2))
                .body(quota + ".quota.remaining", equalTo(0));
        worker.processDue();
        worker.processDue();
        request(member).get(POINTS).then().statusCode(200)
                .body("data.balance", equalTo(17))
                .body(quota + ".quota.completed", equalTo(2));
        request(member).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.size()", equalTo(4))
                .body("data.items.label", equalTo(List.of("테스트 챌린지", "테스트 챌린지", "테스트 챌린지", "테스트 챌린지")))
                .body("data.items[0].skipReason", equalTo("WEEKLY_LIMIT"))
                .body("data.items[2].amount", equalTo(10))
                .body("data.items[3].skipReason", equalTo("INELIGIBLE"));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ExtraRewardRules {
        @Bean
        PointRewardRule challengeClearReward() {
            return PointRewardRule.weekly("TEST_CHALLENGE_CLEAR", "테스트 챌린지", 7, 2);
        }
    }

    @DisplayName("오래된 스냅샷의 동시 요청은 주간 한도를 넘겨 적립할 수 없다.")
    @Test
    void preservesWeeklyLimitUnderRepeatableReadAndRetry() throws Exception {
        // Given
        long winner = member("가온", "21001").getId();
        transaction.executeWithoutResult(status -> {
            rewards.gomokuWon(1, winner, true, FIXED_NOW);
            rewards.gomokuWon(2, winner, true, FIXED_NOW);
        });
        var repeatableRead = new TransactionTemplate(transactionManager);
        repeatableRead.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        CountDownLatch firstReserved = new CountDownLatch(1);
        CountDownLatch secondHasSnapshot = new CountDownLatch(1);

        // When
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> repeatableRead.executeWithoutResult(status -> {
                rewards.gomokuWon(3, winner, true, FIXED_NOW);
                firstReserved.countDown();
                await(secondHasSnapshot);
            }));
            var second = pool.submit(() -> {
                await(firstReserved);
                repeatableRead.executeWithoutResult(status -> {
                    long seen = jdbc.queryForObject("select count(*) from point_reward", Long.class);
                    secondHasSnapshot.countDown();
                    assertThat(seen).isEqualTo(2);
                    rewards.gomokuWon(4, winner, true, FIXED_NOW);
                });
            });
            first.get(10, TimeUnit.SECONDS);
            Throwable failure = catchThrowable(() -> second.get(10, TimeUnit.SECONDS));
            assertThat(failure).isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(BusinessException.class);
            assertThat(((BusinessException) failure.getCause()).getErrorCode()).isEqualTo(ErrorCode.CONCURRENT_MODIFICATION);
            assertThat(NestedExceptionUtils.getMostSpecificCause(failure)).isInstanceOfSatisfying(SQLException.class,
                    cause -> assertThat(cause.getSQLState()).isEqualTo("40001"));
        }
        repeatableRead.executeWithoutResult(status -> rewards.gomokuWon(4, winner, true, FIXED_NOW));
        worker.processDue();

        // Then
        request(winner).get(POINTS).then().statusCode(200)
                .body("data.balance", equalTo(150)).body("data.gomokuWeekly.completed", equalTo(3));
        assertThat(jdbc.queryForObject("select skip_reason from point_reward where source_key = 'game:4'", String.class))
                .isEqualTo("WEEKLY_LIMIT");
    }

    @DisplayName("같은 모임원에게 반대 순서로 일괄 지급해도 교착과 중복 적립이 발생하지 않는다.")
    @Test
    void registersConcurrentBatchesInOneWalletOrder() throws Exception {
        // Given
        long first = member("가온", "21001").getId();
        long second = member("해솔", "21002").getId();
        jdbc.update("insert into point_wallet (member_id) values (?), (?)", first, second);
        List<PointReward> firstBatch = List.of(
                PointReward.of(challengeClearReward, first, "session:1", FIXED_NOW),
                PointReward.of(challengeClearReward, second, "session:1", FIXED_NOW));
        List<PointReward> secondBatch = List.of(
                PointReward.of(challengeClearReward, second, "session:2", FIXED_NOW),
                PointReward.of(challengeClearReward, first, "session:2", FIXED_NOW));
        AtomicInteger forwardPid = new AtomicInteger();
        AtomicInteger reversePid = new AtomicInteger();

        // When
        try (var pool = Executors.newFixedThreadPool(2)) {
            var submissions = transaction.execute(status -> {
                jdbc.queryForObject("select member_id from point_wallet where member_id = ? for no key update",
                        Long.class, first);
                var forward = pool.submit(() -> registerBatch(firstBatch, forwardPid));
                var reverse = pool.submit(() -> registerBatch(secondBatch, reversePid));
                Awaitility.await().atMost(5, TimeUnit.SECONDS)
                        .until(() -> isBlocked(forwardPid) && isBlocked(reversePid));
                jdbc.queryForObject("select member_id from point_wallet where member_id = ? for no key update nowait",
                        Long.class, second);
                return List.of(forward, reverse);
            });
            for (var submission : submissions) {
                submission.get(10, TimeUnit.SECONDS);
            }
        }
        transaction.executeWithoutResult(status -> rewards.registerAll(secondBatch));
        worker.processDue();
        worker.processDue();

        // Then
        assertThat(jdbc.queryForObject("select count(*) from point_reward", Long.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(*) from point_ledger", Long.class)).isEqualTo(4);
        request(first).get(POINTS).then().statusCode(200).body("data.balance", equalTo(14));
        request(second).get(POINTS).then().statusCode(200).body("data.balance", equalTo(14));
    }

    private void registerBatch(List<PointReward> batch, AtomicInteger pid) {
        transaction.executeWithoutResult(status -> {
            pid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
            rewards.registerAll(batch);
        });
    }

    private boolean isBlocked(AtomicInteger pid) {
        return pid.get() != 0 && Boolean.TRUE.equals(jdbc.queryForObject(
                "select cardinality(pg_blocking_pids(?)) > 0", Boolean.class, pid.get()));
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    @DisplayName("모임은 계속 만들 수 있고 생성 보상은 한 주에 두 번만 적립한다.")
    @Test
    void rewardsTwoGroupCreationsPerWeek() {
        long creator = member("가온", "21001").getId();
        String quota = "data.weeklyQuotas.find { it.reason == 'GROUP_CREATED' }.quota";

        createGroup(creator, "첫 번째 모임");
        createGroup(creator, "두 번째 모임");
        createGroup(creator, "세 번째 모임");

        request(creator).get(POINTS).then().statusCode(200)
                .body(quota + ".limit", equalTo(2))
                .body(quota + ".pending", equalTo(2))
                .body(quota + ".remaining", equalTo(0));
        worker.processDue();

        request(creator).get(POINTS).then().statusCode(200)
                .body("data.balance", equalTo(400))
                .body(quota + ".completed", equalTo(2));
        request(creator).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.findAll { it.reason == 'GROUP_CREATED' && it.status == 'COMPLETED' }.amount",
                        equalTo(List.of(200, 200)))
                .body("data.items.findAll { it.reason == 'GROUP_CREATED' && it.status == 'SKIPPED' }.skipReason",
                        equalTo(List.of("WEEKLY_LIMIT")));

        LocalDateTime nextMonday = LocalDateTime.of(2026, 8, 24, 0, 0);
        Group nextGroup = groups.save(Group.createClub("다음 주 모임", "함께해요", null, null, null, nextMonday));
        transaction.executeWithoutResult(status -> rewards.groupCreated(nextGroup.getId(), creator, nextMonday));
        worker.processDue();

        request(creator).get(POINTS).then().statusCode(200).body("data.balance", equalTo(600));
    }

    @Test
    void creditsCreatorAndJoinerOnceEvenAfterGroupIsDeleted() {
        long creator = member("가온", "21001").getId();
        long first = member("해솔", "21002").getId();
        long second = member("여울", "21003").getId();
        long group = createGroup(creator);
        for (long target : new long[] {first, second}) {
            long invitation = request(creator)
                    .body(Map.of("type", "DIRECT", "targetMemberId", target, "requestId", UUID.randomUUID()))
                    .post("/groups/" + group + "/invitations")
                    .then().statusCode(201).extract().jsonPath().getLong("data.id");
            String accept = "/invitations/" + invitation + "/acceptances";
            request(target).body(Map.of()).post(accept).then().statusCode(201);
            request(target).body(Map.of()).post(accept).then().statusCode(200);
        }

        request(creator).get(POINTS).then().statusCode(200)
                .body("data.balance", equalTo(0)).body("data.processing", equalTo(true));
        request(creator).delete("/groups/" + group).then().statusCode(204);
        worker.processDue();
        worker.processDue();

        request(creator).get(POINTS).then().body("data.balance", equalTo(600));
        request(first).get(POINTS).then().body("data.balance", equalTo(150));
        request(second).get(POINTS).then().body("data.balance", equalTo(150));
        assertThat(jdbc.queryForObject("select count(*) from point_ledger", Long.class)).isEqualTo(4);
    }

    @DisplayName("자동 승인과 수동 승인으로 실제 구성원이 됐을 때 적립한다.")
    @ParameterizedTest
    @EnumSource(JoinMethod.class)
    void awardsRecruitmentPointsOnlyAfterMembershipIsApproved(JoinMethod joinMethod) {
        // Given
        long creator = member("가온", "21001").getId();
        long applicant = member("해솔", "21002").getId();
        long group = createGroup(creator);
        long recruitment = request(creator).body(Map.of(
                        "joinMethod", joinMethod.name(), "capacity", 3,
                        "startsAt", FIXED_NOW.toString(), "endsAt", FIXED_NOW.plusDays(1).toString()))
                .post("/groups/" + group + "/recruitments")
                .then().statusCode(201).extract().jsonPath().getLong("data.id");
        String registrations = "/recruitments/" + recruitment + "/registrations";

        // When
        var created = request(applicant).body(Map.of("message", "함께해요"))
                .post(registrations).then().statusCode(201);

        if (joinMethod == JoinMethod.APPROVAL) {
            long registration = created.body("data.status", equalTo("PENDING")).extract().jsonPath().getLong("data.id");
            worker.processDue();
            request(applicant).get(POINTS).then().body("data.processing", equalTo(false))
                    .body("data.balance", equalTo(0));
            request(creator).get(POINTS).then().body("data.balance", equalTo(200));
            request(creator).body(Map.of("status", "APPROVED")).patch(registrations + "/" + registration)
                    .then().statusCode(200).body("data.status", equalTo("APPROVED"));
        } else {
            created.body("data.status", equalTo("APPROVED"));
        }

        // Then
        request(applicant).get(POINTS).then().body("data.processing", equalTo(true))
                .body("data.balance", equalTo(0));
        worker.processDue();
        worker.processDue();

        request(creator).get(POINTS).then().body("data.balance", equalTo(600));
        request(applicant).get(POINTS).then().body("data.balance", equalTo(150));
        assertThat(jdbc.queryForObject("select count(*) from point_ledger", Long.class)).isEqualTo(3);
    }

    @DisplayName("이전 정책에서 예약한 5P는 보존하고 새 오목 승리에는 50P를 적립한다.")
    @Test
    void keepsReservedAmountsWhenRewardPolicyChanges() {
        long winner = member("가온", "21001").getId();

        // Given
        transaction.executeWithoutResult(status -> rewards.gomokuWon(1, winner, true, FIXED_NOW));
        jdbc.update("update point_reward set amount = 5, policy_version = 2 where source_key = 'game:1'");

        // When
        transaction.executeWithoutResult(status -> rewards.gomokuWon(2, winner, true, FIXED_NOW));
        worker.processDue();

        // Then
        request(winner).get(POINTS).then().statusCode(200).body("data.balance", equalTo(55));
        request(winner).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.amount", equalTo(List.of(50, 5)));
        assertThat(jdbc.queryForObject("select policy_version from point_reward where source_key = 'game:2'",
                Integer.class)).isEqualTo(PointPolicy.VERSION);
    }

    @DisplayName("동시에 적립을 예약해도 대국이 끝난 주의 3회 한도와 대국별 중복 방지를 지킨다.")
    @Test
    void reservesWeeklyQuotaAtTheTimeOfTheGame() throws Exception {
        long winner = member("가온", "21001").getId();
        LocalDateTime sunday = LocalDateTime.of(2026, 8, 16, 23, 59);
        transaction.executeWithoutResult(status -> {
            rewards.gomokuWon(1, winner, true, sunday);
            rewards.gomokuWon(2, winner, true, FIXED_NOW);
            rewards.gomokuWon(3, winner, true, FIXED_NOW);
            rewards.gomokuWon(3, winner, true, FIXED_NOW);
            rewards.gomokuWon(4, winner, false, FIXED_NOW);
        });
        request(winner).get(POINTS).then().statusCode(200)
                .body("data.gomokuWeekly.pending", equalTo(2)).body("data.gomokuWeekly.remaining", equalTo(1))
                .body("data.weeklyQuotas.find { it.reason == 'GOMOKU_WIN' }.quota.pending", equalTo(2));

        try (var pool = Executors.newFixedThreadPool(4)) {
            CountDownLatch start = new CountDownLatch(1);
            var tasks = LongStream.range(5, 9).mapToObj(id -> pool.submit(() -> {
                start.await();
                transaction.executeWithoutResult(status -> rewards.gomokuWon(id, winner, true, FIXED_NOW));
                return null;
            })).toList();
            start.countDown();
            for (var task : tasks) {
                task.get(10, TimeUnit.SECONDS);
            }
        }

        request(winner).get(POINTS).then().statusCode(200).body("data.balance", equalTo(0))
                .body("data.gomokuWeekly.pending", equalTo(3)).body("data.gomokuWeekly.remaining", equalTo(0));
        CompletableFuture.allOf(
                CompletableFuture.runAsync(worker::processDue),
                CompletableFuture.runAsync(worker::processDue)
        ).get(10, TimeUnit.SECONDS);
        request(winner).get(POINTS).then().body("data.balance", equalTo(200))
                .body("data.gomokuWeekly.completed", equalTo(3));
        request(winner).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.size()", equalTo(8))
                .body("data.items.findAll { it.skipReason == 'WEEKLY_LIMIT' }.size()", equalTo(3));
        var history = request(winner).queryParam("size", 2).get(POINTS + "/transactions").then()
                .statusCode(200).body("data.hasNext", equalTo(true)).extract().jsonPath();
        request(winner).queryParam("size", 2).queryParam("cursor", history.getString("data.nextCursor"))
                .get(POINTS + "/transactions").then().statusCode(200).body("data.items.size()", equalTo(2));
        request(winner).queryParam("cursor", "wrong!").get(POINTS + "/transactions").then().statusCode(400);
        request(winner).queryParam("size", 101).get(POINTS + "/transactions").then().statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        given().get(POINTS).then().statusCode(401);
    }

    @DisplayName("같은 상대와의 재대결에서도 양쪽이 5수씩 놓은 기권 승리를 주 3회까지 적립한다.")
    @Test
    void awardsEligibleResignationRematchesUpToWeeklyLimit() {
        long host = member("가온", "21001").getId();
        long guest = member("해솔", "21002").getId();
        String game = GOMOKU_ROOMS + "/" + createRoom(host, guest);
        playAndResign(game, 1, host, guest, 9);
        for (int number = 2; number <= 5; number++) {
            playAndResign(game, number, host, guest, 10);
        }

        worker.processDue();

        request(host).get(POINTS).then().body("data.balance", equalTo(150));
        request(guest).get(POINTS).then().body("data.balance", equalTo(0));
        request(host).get(POINTS + "/transactions").then()
                .body("data.items.status", equalTo(List.of("SKIPPED", "COMPLETED", "COMPLETED", "COMPLETED", "SKIPPED")))
                .body("data.items[0].skipReason", equalTo("WEEKLY_LIMIT"))
                .body("data.items[4].skipReason", equalTo("TOO_FEW_MOVES"));
    }

    @DisplayName("아홉 번째 착수에서 정상 5목을 완성한 승자에게 적립한다.")
    @Test
    void awardsFiveInARowOnTheNinthMove() {
        // Given
        long host = member("가온", "21001").getId();
        long guest = member("해솔", "21002").getId();
        String game = GOMOKU_ROOMS + "/" + createRoom(host, guest);

        // When
        long winner = playMoves(game, 1, host, guest, 9, 1);

        request(winner).get(game).then().statusCode(200).body("data.endReason", equalTo("FIVE"));
        worker.processDue();
        worker.processDue();

        // Then
        request(winner).get(POINTS).then().body("data.balance", equalTo(50));
        request(winner == host ? guest : host).get(POINTS).then().body("data.balance", equalTo(0));
        assertThat(jdbc.queryForObject("select count(*) from point_ledger", Long.class)).isEqualTo(1);
    }

    @DisplayName("시간패는 양쪽이 5수씩 놓았을 때만 마감 시각을 기준으로 적립한다.")
    @ParameterizedTest
    @ValueSource(ints = {9, 10})
    void timeoutUsesDeadlineAndRequiresFiveMovesFromBothPlayers(int moves) {
        // Given
        long host = member("가온", "21001").getId();
        long guest = member("해솔", "21002").getId();
        long room = createRoom(host, guest);
        String game = GOMOKU_ROOMS + "/" + room;
        long black = playMoves(game, 1, host, guest, moves, 2);
        long white = black == host ? guest : host;
        long winner = moves == 9 ? black : white;
        long loser = winner == black ? white : black;
        LocalDateTime deadline = FIXED_NOW.minusMinutes(1);
        jdbc.update("update gomoku_room set turn_deadline = ? where id = ?", deadline, room);

        // When
        request(loser).body(Map.of("gameNumber", 1)).post(game + "/resign").then().statusCode(409);
        request(loser).body(Map.of("gameNumber", 1)).post(game + "/resign").then().statusCode(409);
        request(winner).get(game).then().statusCode(200).body("data.endReason", equalTo("TIMEOUT"));
        worker.processDue();
        worker.processDue();

        // Then
        boolean eligible = moves == 10;
        request(winner).get(POINTS).then().body("data.balance", equalTo(eligible ? 50 : 0));
        request(loser).get(POINTS).then().body("data.balance", equalTo(0));
        request(winner).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].occurredAt", equalTo("2026-08-19T09:59:00"))
                .body("data.items[0].status", equalTo(eligible ? "COMPLETED" : "SKIPPED"))
                .body("data.items[0].skipReason", eligible ? nullValue() : equalTo("TOO_FEW_MOVES"));
    }

    @Test
    void olderMembershipAndNewJoinShareTheFirstJoinAward() {
        LocalDateTime older = FIXED_NOW.minusMonths(1);
        Member member = member("가온", "21001");
        Group group = groups.save(Group.createClub("기존 모임", "함께해요", null, null, null, older));
        jdbc.update("update groups set created_at = ? where id = ?", older.plusSeconds(1), group.getId());
        memberships.save(GroupMember.createLeader(group, member, older));

        request(member.getId()).post(POINTS + "/first-join-claim").then().statusCode(200)
                .body("data.queued", equalTo(false));

        Group joinedGroup = groups.save(Group.createClub("위임받은 모임", "함께해요", null, null, null, older));
        jdbc.update("update groups set created_at = ? where id = ?", older.plusSeconds(1), joinedGroup.getId());
        memberships.save(GroupMember.createLeader(joinedGroup, member, older.plusDays(1)));
        request(member.getId()).post(POINTS + "/first-join-claim").then().statusCode(200)
                .body("data.queued", equalTo(true));
        request(member.getId()).post(POINTS + "/first-join-claim").then().statusCode(200)
                .body("data.queued", equalTo(false));
        transaction.executeWithoutResult(status -> rewards.groupJoined(group.getId() + 1, 12,
                member.getId(), FIXED_NOW));
        worker.processDue();

        request(member.getId()).get(POINTS).then().body("data.balance", equalTo(150));
        assertThat(jdbc.queryForObject("select count(*) from point_reward where skip_reason = 'ALREADY_REWARDED'",
                Long.class)).isEqualTo(1);
        request(member.getId()).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items.status", equalTo(List.of("COMPLETED")));
    }

    @Test
    void rollbackAndRepeatedSettlementKeepLedgerAndBalanceConsistent() {
        long author = member("가온", "21001").getId();
        transaction.executeWithoutResult(status -> {
            rewards.activityPublished(10, 1, author, FIXED_NOW.toLocalDate(), FIXED_NOW);
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("select count(*) from point_reward", Long.class)).isZero();
        transaction.executeWithoutResult(status -> {
            rewards.activityPublished(10, 1, author, FIXED_NOW.toLocalDate(), FIXED_NOW);
            rewards.activityPublished(10, 1, author, FIXED_NOW.toLocalDate(), FIXED_NOW);
            rewards.activityPublished(11, 1, author, FIXED_NOW.toLocalDate(), FIXED_NOW);
        });
        jdbc.update("update point_wallet set balance = 9007199254740991 where member_id = ?", author);

        worker.processDue();

        assertThat(jdbc.queryForObject("select count(*) from point_ledger", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select status from point_reward where source_key = 'post:10'",
                String.class)).isEqualTo("NEEDS_REVIEW");
        jdbc.update("update point_wallet set balance = 0 where member_id = ?", author);
        jdbc.update("update point_reward set status = 'PENDING', next_attempt_at = ? where status = 'NEEDS_REVIEW'",
                FIXED_NOW);
        worker.processDue();
        worker.processDue();

        request(author).get(POINTS).then().body("data.balance", equalTo(150));
        assertThat(jdbc.queryForObject("select count(*) from point_ledger", Long.class)).isEqualTo(1);
    }

    @DisplayName("날짜를 수정한 뒤 원래 날짜로 재게시해도 적립하지 않는다.")
    @Test
    void changingActivityDateDoesNotFreeOriginalRewardDate() {
        // Given
        long author = member("가온", "21001").getId();
        long group = createGroup(author);
        LocalDate originalDate = FIXED_NOW.toLocalDate().minusDays(1);
        LocalDate editedDate = originalDate.minusDays(1);
        long post = publishActivity(author, group, originalDate);

        // When
        request(author).body(Map.of("caption", "날짜 수정", "activityDate", editedDate.toString()))
                .put("/activity-posts/" + post).then().statusCode(200);
        request(author).get("/groups/" + group + "/activity-posts").then().statusCode(200)
                .body("data.items[0].activityDate", equalTo(editedDate.toString()));

        publishActivity(author, group, originalDate);
        request(author).get(POINTS).then().body("data.activityPostWeekly.pending", equalTo(1))
                .body("data.activityPostWeekly.remaining", equalTo(1));
        publishActivity(author, group, editedDate);
        publishActivity(author, group, editedDate.minusDays(1));
        worker.processDue();

        // Then
        request(author).get(POINTS).then().body("data.balance", equalTo(500))
                .body("data.activityPostWeekly.completed", equalTo(2));
        request(author).get(POINTS + "/transactions").then().statusCode(200)
                .body("data.items[0].skipReason", equalTo("WEEKLY_LIMIT"))
                .body("data.items[1].status", equalTo("COMPLETED"))
                .body("data.items[2].skipReason", equalTo("SAME_ACTIVITY_DATE"))
                .body("data.items[3].status", equalTo("COMPLETED"));
    }

    private long createGroup(long creator) {
        return createGroup(creator, "함께 공부");
    }

    private long createGroup(long creator, String name) {
        return request(creator).body(Map.of("name", name, "type", "CLUB",
                        "introduction", "함께해요", "meetingType", "ONLINE"))
                .post("/groups").then().statusCode(201).extract().jsonPath().getLong("data.id");
    }

    private long createRoom(long host, long guest) {
        long room = request(host).body(Map.of("visibility", "PUBLIC", "rule", "FREESTYLE"))
                .post(GOMOKU_ROOMS).then().statusCode(201).extract().jsonPath().getLong("data.roomId");
        request(guest).body(Map.of()).post(GOMOKU_ROOMS + "/" + room + "/join").then().statusCode(200);
        return room;
    }

    private long publishActivity(long author, long group, LocalDate date) {
        String imageKey = request(author)
                .body(Map.of("fileName", "activity.jpg", "contentType", "image/jpeg", "fileSize", 1024))
                .post("/image-uploads").then().statusCode(201).extract().jsonPath().getString("data.imageKey");
        return request(author).body(Map.of("imageKey", imageKey, "caption", "활동 기록", "activityDate", date.toString()))
                .post("/groups/" + group + "/activity-posts")
                .then().statusCode(201).extract().jsonPath().getLong("data.id");
    }

    private void playAndResign(String game, int number, long host, long guest, int moves) {
        playMoves(game, number, host, guest, moves, 2);
        request(guest).body(Map.of("gameNumber", number)).post(game + "/resign").then().statusCode(200);
    }

    private long playMoves(String game, int number, long host, long guest, int moves, int spacing) {
        for (long player : new long[] {host, guest}) {
            request(player).body(Map.of("gameNumber", number, "ready", true))
                    .put(game + "/ready").then().statusCode(200);
        }
        request(host).body(Map.of("gameNumber", number)).post(game + "/start").then().statusCode(200);
        long black = request(host).get(game).jsonPath().getLong("data.blackMemberId");
        long white = black == host ? guest : host;
        for (int ply = 0; ply < moves; ply++) {
            long player = ply % 2 == 0 ? black : white;
            request(player).body(Map.of("gameNumber", number, "expectedPly", ply, "x", (ply / 2) * spacing,
                            "y", (ply % 2) * 2, "requestId", UUID.randomUUID()))
                    .post(game + "/moves").then().statusCode(200);
        }
        return black;
    }

    private Member member(String name, String githubId) {
        return members.save(Member.create(name, 23, githubId, Course.BACKEND));
    }

    private RequestSpecification request(long memberId) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().contentType("application/json").cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf).cookie(cookies.accessTokenName(), tokens.issue(memberId).value());
    }
}
