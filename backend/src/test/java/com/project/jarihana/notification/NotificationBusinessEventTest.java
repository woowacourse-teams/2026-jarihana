package com.project.jarihana.notification;

import com.project.jarihana.group.command.service.GroupCommandService;
import com.project.jarihana.group.command.service.dto.TerminateGroupCommand;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.recruitment.command.service.RecruitmentCommandService;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentCommand;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.command.service.RegistrationCommandService;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.RegistrationDecision;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationBusinessEventTest extends NotificationIntegrationTestSupport {

    @Autowired private RegistrationCommandService registrationService;
    @Autowired private RegistrationCommandRepository registrations;
    @Autowired private RecruitmentCommandService recruitmentService;
    @Autowired private GroupCommandService groupService;

    @Test
    @DisplayName("승인제 신청은 모임장에게 알림을 남기고 활성 구독별로 전송 대기를 만든다.")
    void submittedRegistrationCreatesLeaderInboxAndActiveDeliveries() {
        // Given
        Member leader = member("101");
        Member applicant = member("102");
        GroupRecruitment recruitment = recruitment(leader, JoinMethod.APPROVAL, 3);
        subscription(leader, "one");
        subscription(leader, "two");
        subscriptions.save(subscription(leader, "disabled").disable(NOW));
        subscription(applicant, "other-owner");

        // When
        long id = registrationService.createRegistration(applicant.getId(), recruitment.getId(),
                new CreateRegistrationCommand("민감한 신청 본문")).id();

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(leader.getId());
        assertThat(jdbc.queryForObject("select event_type from notifications", String.class)).isEqualTo("REGISTRATION_SUBMITTED");
        assertThat(jdbc.queryForObject("select payload ->> 'registrationId' from notifications", Long.class)).isEqualTo(id);
        assertThat(jdbc.queryForObject("select payload::text from notifications", String.class)).doesNotContain("민감한");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForList("select status from notification_deliveries", String.class)).containsOnly("PENDING");
    }

    @Test
    @DisplayName("자동 승인 참여는 구독이 없어도 모임장과 신청자에게 각각 알림을 남긴다.")
    void automaticJoinCreatesTwoInboxesWithoutSubscriptions() {
        // Given
        Member leader = member("101");
        Member applicant = member("102");
        GroupRecruitment recruitment = recruitment(leader, JoinMethod.AUTO, 3);

        // When
        registrationService.createRegistration(applicant.getId(), recruitment.getId(), new CreateRegistrationCommand(null));

        // Then
        assertThat(jdbc.queryForList("select event_type from notifications", String.class))
                .containsExactlyInAnyOrder("PARTICIPANT_JOINED", "REGISTRATION_APPROVED");
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class))
                .containsExactlyInAnyOrder(leader.getId(), applicant.getId());
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    @ParameterizedTest
    @EnumSource(RegistrationDecision.class)
    @DisplayName("모임장의 실제 승인 또는 미승인 결과는 신청자에게 한 번만 기록한다.")
    void manualDecisionCreatesApplicantNotificationOnce(RegistrationDecision decision) {
        // Given
        Member leader = member("101");
        Member applicant = member("102");
        GroupRecruitment recruitment = recruitment(leader, JoinMethod.APPROVAL, 1);
        Registration pending = pending(recruitment, applicant);
        Registration other = pending(recruitment, member("103"));
        DecideRegistrationCommand command = new DecideRegistrationCommand(decision,
                decision == RegistrationDecision.REJECTED ? "민감한 미승인 사유" : null);

        // When
        registrationService.decideRegistration(leader.getId(), recruitment.getId(), pending.getId(), command);

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(applicant.getId());
        assertThat(jdbc.queryForObject("select event_type from notifications", String.class))
                .isEqualTo("REGISTRATION_" + decision.name());
        assertThat(jdbc.queryForObject("select payload::text from notifications", String.class)).doesNotContain("민감한");
        assertThat(registrations.findById(other.getId()).orElseThrow().getStatus())
                .isEqualTo(RegistrationStatus.PENDING);
        assertThatThrownBy(() -> registrationService.decideRegistration(leader.getId(), recruitment.getId(), pending.getId(), command))
                .isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
    }

    @ParameterizedTest
    @EnumSource(value = JoinMethod.class, names = {"APPROVAL", "AUTO"})
    @DisplayName("재모집은 기존 활성 모집에서 실제 미승인한 신청만 알린다.")
    void rerecruitmentNotifiesOnlyActuallyRejectedPendingRegistrations(JoinMethod newMethod) {
        // Given
        Member leader = member("101");
        GroupRecruitment active = recruitment(leader, JoinMethod.APPROVAL, 3);
        Member applicant = member("102");
        pending(active, applicant);
        GroupRecruitment closed = recruitments.save(GroupRecruitment.create(active.getGroup(), JoinMethod.APPROVAL,
                3, NOW.minusDays(3), NOW.minusDays(2)));
        pending(closed, member("103"));

        // When
        recruitmentService.createRecruitment(leader.getId(), active.getGroup().getId(),
                new CreateRecruitmentCommand(newMethod, 3, NOW, NOW.plusDays(7)));

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(applicant.getId());
        assertThat(jdbc.queryForObject("select payload ->> 'reasonCode' from notifications", String.class)).isEqualTo("RERECRUITMENT");
        assertThat(registrations.countByRecruitmentIdAndStatus(closed.getId(), RegistrationStatus.PENDING)).isEqualTo(1);
    }

    @Test
    @DisplayName("그룹 종료는 실제 시스템 미승인한 신청에 그룹 종료 원인을 남긴다.")
    void groupTerminationNotifiesActualSystemRejections() {
        // Given
        Member leader = member("101");
        GroupRecruitment active = recruitment(leader, JoinMethod.APPROVAL, 3);
        Member applicant = member("102");
        pending(active, applicant);

        // When
        jdbc.update("update groups set created_at = ?, updated_at = ? where id = ?", NOW.minusDays(10), NOW.minusDays(10), active.getGroup().getId());
        groupService.terminateGroup(leader.getId(), active.getGroup().getId(), new TerminateGroupCommand(GroupStatus.ENDED));

        // Then
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(applicant.getId());
        assertThat(jdbc.queryForObject("select payload ->> 'reasonCode' from notifications", String.class)).isEqualTo("GROUP_ENDED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"notifications", "notification_deliveries"})
    @DisplayName("알림 또는 전송 대기 저장이 실패하면 승인과 구성원 등록도 함께 롤백한다.")
    void notificationFailureRollsBackBusinessDecision(String table) {
        // Given
        Member leader = member("101");
        Member applicant = member("102");
        GroupRecruitment recruitment = recruitment(leader, JoinMethod.APPROVAL, 3);
        Registration pending = pending(recruitment, applicant);
        subscription(applicant, "one");
        jdbc.execute("""
                create function notification_test_fail() returns trigger language plpgsql as $$
                begin raise exception 'notification write failure'; end; $$
                """);
        jdbc.execute("create trigger notification_test_fail before insert on " + table + " for each row execute function notification_test_fail()");
        try {
            // When / Then
            assertThatThrownBy(() -> registrationService.decideRegistration(leader.getId(), recruitment.getId(), pending.getId(),
                    new DecideRegistrationCommand(RegistrationDecision.APPROVED, null))).isInstanceOf(RuntimeException.class);
            assertThat(registrations.findById(pending.getId()).orElseThrow().getStatus())
                    .isEqualTo(RegistrationStatus.PENDING);
            assertThat(groupMembers.findByGroupIdAndMemberId(recruitment.getGroup().getId(), applicant.getId())).isEmpty();
            assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
        } finally {
            jdbc.execute("drop trigger notification_test_fail on " + table);
            jdbc.execute("drop function notification_test_fail()");
        }
    }

    @Test
    @DisplayName("원 그룹과 신청을 물리 삭제해도 이미 생성한 회원 알림은 보존한다.")
    void deletingOriginalBusinessRecordsPreservesInbox() {
        // Given
        Member leader = member("101");
        Member applicant = member("102");
        GroupRecruitment recruitment = recruitment(leader, JoinMethod.APPROVAL, 3);
        registrationService.createRegistration(applicant.getId(), recruitment.getId(), new CreateRegistrationCommand(null));

        // When
        groupService.deleteGroup(leader.getId(), recruitment.getGroup().getId());

        // Then
        assertThat(groups.findById(recruitment.getGroup().getId())).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from registration", Integer.class)).isZero();
        assertThat(jdbc.queryForList("select member_id from notifications", Long.class)).containsExactly(leader.getId());
    }

    private Registration pending(GroupRecruitment recruitment, Member applicant) {
        return registrations.save(Registration.createPending(recruitment, applicant, null, recruitment.getStartsAt().plusHours(1)));
    }
}
