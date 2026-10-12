package com.project.jarihana.notification;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.registration.domain.event.RegistrationDecidedEvent;
import com.project.jarihana.registration.domain.event.RegistrationSubmittedEvent;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import lombok.RequiredArgsConstructor;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;

@Import(NotificationEventFailureAcceptanceTest.FaultConfiguration.class)
class NotificationEventFailureAcceptanceTest extends NotificationIntegrationTestSupport {

    @Autowired private RegistrationCommandRepository registrations;
    @Autowired private AccessTokenProvider tokens;
    @Autowired private AuthCookieProperties cookies;

    enum FaultSource { FACTORY, LISTENER }

    @ParameterizedTest
    @EnumSource(FaultSource.class)
    @DisplayName("서버가 대기 신청을 결정 사건으로 처리하면 500을 반환하고 업무·알림·전송을 롤백한다.")
    void invalidInternalEventReturnsServerErrorAndRollsBack(FaultSource source) {
        // Given
        Member leader = member("101");
        GroupRecruitment recruitment = recruitment(leader, JoinMethod.APPROVAL, 3);
        Registration pending = registrations.save(Registration.createPending(recruitment, member("102"), null, NOW));
        subscription(leader, "leader");
        long groupId = recruitment.getGroup().getId();
        String originalName = jdbc.queryForObject("select name from groups where id = ?", String.class, groupId);
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");

        // When
        Response response = RestAssured.given()
                .cookie(cookies.accessTokenName(), tokens.issue(leader.getId()).value())
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .post("/test/notification-event/{source}/{registrationId}/{leaderId}",
                        source, pending.getId(), leader.getId());

        // Then
        assertThat(jdbc.queryForObject("select name from groups where id = ?", String.class, groupId))
                .isEqualTo(originalName);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
        assertThat(response.statusCode()).isEqualTo(500);
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INTERNAL_ERROR");
        assertThat(response.asString()).doesNotContain("결정된 신청", "대기 신청은", "IllegalStateException");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FaultConfiguration {

        @Bean
        FaultController faultController(RegistrationCommandRepository registrations,
                                        ApplicationEventPublisher events, JdbcTemplate jdbc) {
            return new FaultController(registrations, events, jdbc);
        }
    }

    @RestController
    @TestComponent
    @RequiredArgsConstructor
    public static class FaultController {

        private final RegistrationCommandRepository registrations;
        private final ApplicationEventPublisher events;
        private final JdbcTemplate jdbc;

        @Transactional
        @PostMapping("/test/notification-event/{source}/{registrationId}/{leaderId}")
        public void fail(@PathVariable FaultSource source, @PathVariable long registrationId,
                         @PathVariable long leaderId) {
            Registration pending = registrations.findById(registrationId).orElseThrow();
            long groupId = pending.getRecruitment().getGroup().getId();
            jdbc.update("update groups set name = ? where id = ?", "실패모임", groupId);
            events.publishEvent(RegistrationSubmittedEvent.from(pending, leaderId));
            RegistrationDecidedEvent invalid = switch (source) {
                case FACTORY -> RegistrationDecidedEvent.from(pending);
                case LISTENER -> new RegistrationDecidedEvent(groupId, pending.getRecruitment().getId(),
                        pending.getId(), pending.getMember().getId(), RegistrationStatus.PENDING, null, NOW);
            };
            events.publishEvent(invalid);
        }
    }
}
