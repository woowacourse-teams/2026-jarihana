package com.project.jarihana.common.config;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.deployment.ApplicationActivity;
import com.project.jarihana.notificationdelivery.domain.DeploymentPhase;
import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;
import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

import java.io.IOException;
import java.net.ServerSocket;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("prod")
@TestPropertySource(properties = {
        "management.server.address=127.0.0.1",
        "jarihana.push.worker-control-enabled=true",
        "jarihana.push.worker-host-id=control-test",
        "jarihana.push.worker-environment=control-test",
        "jarihana.worker-control.token=worker-control-test-token-0123456789abcdef",
        "jarihana.worker-control.version=acceptance-test"
})
class WorkerControlEndpointAcceptanceTest extends IntegrationTestSupport {

    private static final String CONTROL_TOKEN = "worker-control-test-token-0123456789abcdef";
    private static final int MANAGEMENT_SERVER_PORT = findAvailablePort();

    @DynamicPropertySource
    static void configureManagementServerPort(DynamicPropertyRegistry registry) {
        registry.add("management.server.port", () -> MANAGEMENT_SERVER_PORT);
    }

    @Value("${local.management.port}")
    private int managementPort;

    @LocalServerPort
    private int applicationPort;

    @Autowired
    private WorkerIdentity identity;

    @Autowired
    private WorkerAdmissionController admission;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private Clock clock;

    @Autowired
    private ApplicationActivity activity;

    @DisplayName("관리 포트의 worker 상태 조회는 머신 토큰이 있어야 하며 현재 프로세스 정보를 반환한다.")
    @Test
    void readWorkerStatusWithMachineToken() {
        // Given
        admission.pause();

        // When
        var denied = managementRequest().get("/actuator/workercontrol").then().extract();
        var response = managementRequest().header("X-Jarihana-Worker-Control-Token", CONTROL_TOKEN)
                .get("/actuator/workercontrol").then().extract();

        // Then
        assertThat(denied.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.jsonPath().getString("version")).isEqualTo("acceptance-test");
        assertThat(response.jsonPath().getString("environment")).isEqualTo("control-test");
        assertThat(response.jsonPath().getString("identity.hostId")).isEqualTo(identity.hostId());
        assertThat(response.jsonPath().getString("identity.bootId")).isEqualTo(identity.bootId().toString());
        assertThat(response.jsonPath().getString("worker.state")).isEqualTo("PAUSED");
        assertThat(response.jsonPath().getInt("worker.inFlight")).isZero();
        assertThat(response.jsonPath().getInt("worker.unresolved")).isZero();
        assertThat(response.jsonPath().getInt("activity.httpInFlight")).isZero();
        assertThat(response.jsonPath().getInt("activity.backgroundInFlight")).isZero();
        assertThat(response.jsonPath().getBoolean("activity.backgroundDrained")).isTrue();
    }

    @DisplayName("worker가 PAUSED여도 스케줄러 실행이 남아 있으면 백그라운드 종료 완료로 응답하지 않는다.")
    @Test
    void backgroundActivityPreventsDrainedStatus() {
        // Given
        admission.pause();

        try (var scheduledCycle = activity.beginBackground()) {
            // When
            var response = managementRequest().header("X-Jarihana-Worker-Control-Token", CONTROL_TOKEN)
                    .get("/actuator/workercontrol").then().statusCode(200).extract();

            // Then
            assertThat(response.jsonPath().getInt("activity.backgroundInFlight")).isEqualTo(1);
            assertThat(response.jsonPath().getBoolean("activity.backgroundDrained")).isFalse();
        }
        var idle = managementRequest().header("X-Jarihana-Worker-Control-Token", CONTROL_TOKEN)
                .get("/actuator/workercontrol").then().statusCode(200).extract();
        assertThat(idle.jsonPath().getInt("activity.backgroundInFlight")).isZero();
        assertThat(idle.jsonPath().getBoolean("activity.backgroundDrained")).isTrue();
    }

    @DisplayName("일반 JWT와 잘못된 머신 토큰으로는 worker 제어를 호출할 수 없다.")
    @Test
    void denyWorkerControlWithoutMachineCredential() {
        // Given
        String jwt = accessTokenProvider.issue(1L).value();

        // When
        var wrongToken = managementRequest().header("X-Jarihana-Worker-Control-Token", "wrong-token")
                .post("/actuator/workercontrol/activate").then().extract();
        var normalJwt = managementRequest().cookie(authCookieProperties.accessTokenName(), jwt)
                .post("/actuator/workercontrol/activate").then().extract();

        // Then
        assertThat(wrongToken.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(normalJwt.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
    }

    @DisplayName("공개 API 포트에서는 올바른 머신 토큰과 사용자 JWT가 있어도 worker 제어를 거부한다.")
    @Test
    void denyWorkerControlOnApplicationPort() {
        // Given
        String jwt = accessTokenProvider.issue(1L).value();

        // When
        var withMachineToken = RestAssured.given().port(applicationPort)
                .header("X-Jarihana-Worker-Control-Token", CONTROL_TOKEN)
                .post("/actuator/workercontrol/activate").then().extract();
        var withJwt = RestAssured.given().port(applicationPort)
                .cookie(authCookieProperties.accessTokenName(), jwt)
                .post("/actuator/workercontrol/activate").then().extract();

        // Then
        assertThat(withMachineToken.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(withJwt.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
    }

    @DisplayName("같은 begin 명령은 재시도해도 한 번만 적용되고 오래된 명령은 상태를 바꾸지 않는다.")
    @Test
    void applyCommandIdempotentlyAndRejectStaleCommand() {
        // Given
        UUID deploymentId = UUID.randomUUID();
        UUID commandId = UUID.randomUUID();
        Map<String, Object> begin = command(deploymentId, commandId, 0, DeploymentPhase.IDLE, 0, null);

        // When
        var first = send("begin", begin);
        var retry = send("begin", begin);
        var stale = send("begin", command(deploymentId, UUID.randomUUID(), 0, DeploymentPhase.IDLE, 0, null));
        var unknown = send("shell", begin);

        // Then
        assertThat(first.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(retry.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(first.jsonPath().getLong("authority.revision")).isEqualTo(1);
        assertThat(retry.jsonPath().getLong("authority.revision")).isEqualTo(1);
        assertThat(stale.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(unknown.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(jdbcTemplate.queryForObject(
                "select revision from worker_authority where environment = ?", Long.class, "control-test"))
                .isEqualTo(1L);
    }

    @DisplayName("worker 명령의 target boot가 현재 프로세스와 다르면 권한 상태를 바꾸지 않는다.")
    @Test
    void rejectCommandTargetingAnotherProcessBoot() {
        // Given
        UUID deploymentId = UUID.randomUUID();
        var begin = send("begin", command(deploymentId, UUID.randomUUID(), 0,
                DeploymentPhase.IDLE, 0, null));
        Map<String, Object> wrongTarget = command(deploymentId, UUID.randomUUID(), 1,
                DeploymentPhase.PREPARE, 1, DeploymentPhase.HANDOFF);
        wrongTarget.put("targetBootId", UUID.randomUUID().toString());

        // When
        var response = send("phase", wrongTarget);

        // Then
        assertThat(begin.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(jdbcTemplate.queryForObject(
                "select revision from worker_authority where environment = ?", Long.class, "control-test"))
                .isEqualTo(1L);
    }

    @DisplayName("고정 worker 명령으로 A를 pause하고 drain 후 release해도 사용자 HTTP 요청은 계속 처리한다.")
    @Test
    void handOffWorkerAuthorityWithoutRestartingHttpServer() {
        // Given
        UUID deploymentId = UUID.randomUUID();
        var begin = send("begin", command(deploymentId, UUID.randomUUID(), 0,
                DeploymentPhase.IDLE, 0, null));
        var handoff = send("phase", command(deploymentId, UUID.randomUUID(), 1,
                DeploymentPhase.PREPARE, 1, DeploymentPhase.HANDOFF));
        var activate = send("activate", command(deploymentId, UUID.randomUUID(), 1,
                DeploymentPhase.HANDOFF, 2, null));
        var activeStatus = managementRequest().header("X-Jarihana-Worker-Control-Token", CONTROL_TOKEN)
                .get("/actuator/workercontrol").then().statusCode(200).extract();

        // When
        var pause = send("pause", command(deploymentId, UUID.randomUUID(), 1,
                DeploymentPhase.HANDOFF, 3, null));
        var status = managementRequest().header("X-Jarihana-Worker-Control-Token", CONTROL_TOKEN)
                .get("/actuator/workercontrol").then().extract();
        var release = send("release", command(deploymentId, UUID.randomUUID(), 1,
                DeploymentPhase.HANDOFF, 4, null));
        var http = RestAssured.given().port(applicationPort).get("/groups?size=1").then().extract();

        // Then
        assertThat(begin.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(handoff.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(activate.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(activeStatus.jsonPath().getBoolean("activity.backgroundDrained")).isFalse();
        assertThat(pause.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(status.jsonPath().getString("worker.state")).isEqualTo("PAUSED");
        assertThat(status.jsonPath().getInt("worker.inFlight")).isZero();
        assertThat(release.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(release.jsonPath().getString("authority.status")).isEqualTo("UNASSIGNED");
        assertThat(http.statusCode()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("관리 API는 권한 반납이 끝난 시험을 대기 상태로 종료하고 다음 begin을 허용한다.")
    void completeReleasedRehearsalAndAllowNextBegin() {
        // Given
        admission.pause();
        UUID deploymentId = UUID.randomUUID();
        send("begin", command(deploymentId, UUID.randomUUID(), 0, DeploymentPhase.IDLE, 0, null))
                .then().statusCode(200);
        send("phase", command(deploymentId, UUID.randomUUID(), 1, DeploymentPhase.PREPARE, 1, DeploymentPhase.HANDOFF))
                .then().statusCode(200);
        send("activate", command(deploymentId, UUID.randomUUID(), 1, DeploymentPhase.HANDOFF, 2, null))
                .then().statusCode(200);
        send("pause", command(deploymentId, UUID.randomUUID(), 1, DeploymentPhase.HANDOFF, 3, null))
                .then().statusCode(200);
        send("release", command(deploymentId, UUID.randomUUID(), 1, DeploymentPhase.HANDOFF, 4, null))
                .then().statusCode(200);

        // When
        var completed = send("phase", command(deploymentId, UUID.randomUUID(), 1,
                DeploymentPhase.HANDOFF, 5, DeploymentPhase.COMPLETE));

        // Then
        assertThat(completed.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(completed.jsonPath().getString("authority.status")).isEqualTo("UNASSIGNED");
        assertThat(completed.jsonPath().getString("authority.phase")).isEqualTo("COMPLETE");
        assertThat(completed.jsonPath().getString("authority.owner")).isNull();
        assertThat(admission.drainStatus().isDrained()).isTrue();
        send("begin", command(UUID.randomUUID(), UUID.randomUUID(), 1, DeploymentPhase.COMPLETE, 6, null))
                .then().statusCode(200);
    }

    private Map<String, Object> command(UUID deploymentId, UUID commandId,
                                        long epoch, DeploymentPhase expectedPhase, long expectedRevision,
                                        DeploymentPhase nextPhase) {
        Map<String, Object> command = new HashMap<>();
        command.put("deploymentId", deploymentId.toString());
        command.put("epoch", epoch);
        command.put("commandId", commandId.toString());
        command.put("targetHostId", identity.hostId());
        command.put("targetBootId", identity.bootId().toString());
        command.put("expectedPhase", expectedPhase.name());
        command.put("deadline", LocalDateTime.now(clock).plusMinutes(5).toString());
        command.put("expectedRevision", expectedRevision);
        if (nextPhase != null) {
            command.put("nextPhase", nextPhase.name());
        }
        return command;
    }

    private io.restassured.response.Response send(String operation, Map<String, Object> body) {
        return managementRequest().header("X-Jarihana-Worker-Control-Token", CONTROL_TOKEN)
                .contentType("application/json").body(body)
                .post("/actuator/workercontrol/" + operation).then().extract().response();
    }

    private RequestSpecification managementRequest() {
        return RestAssured.given().port(managementPort).basePath("");
    }

    private static int findAvailablePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException exception) {
            throw new IllegalStateException("테스트용 관리 포트를 할당하지 못했습니다.", exception);
        }
    }
}
