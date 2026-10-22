package com.project.jarihana.invitation;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.invitation.command.service.InvitationCommandService;
import com.project.jarihana.invitation.command.service.dto.CreateInvitationCommand;
import com.project.jarihana.invitation.domain.InvitationType;
import com.project.jarihana.invitation.domain.event.InvitationIssuedEvent;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Import(PushTransportTestConfig.class)
class InvitationNotificationDeliveryTest extends PushIntegrationTestSupport {
    @Autowired private InvitationCommandService invitations;
    @Autowired private PushDeliveryWorker worker;
    @Autowired private PushTransportStub transport;
    @Autowired private ApplicationEventPublisher events;
    @Autowired private PlatformTransactionManager transactions;

    @BeforeEach
    void resetTransport() { transport.reset(); }

    @Test
    @DisplayName("지정 초대 사건 재처리는 알림과 구독별 전송을 중복하지 않고 푸시 내용은 현재 대상 계정에만 제공한다.")
    void replayKeepsOneInboxAndValidatesPushContentOwnership() {
        // Given
        Member inviter = member("101");
        Member target = member("102");
        Member other = member("103");
        Group group = group(inviter);
        var subscription = subscription(target, "one");
        subscription(target, "two");
        var issued = invitations.createInvitation(inviter.getId(), group.getId(),
                new CreateInvitationCommand(InvitationType.DIRECT, target.getId(), UUID.randomUUID()));

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            events.publishEvent(new InvitationIssuedEvent(issued.id(), group.getId(), target.getId(), NOW));
            events.publishEvent(new InvitationIssuedEvent(issued.id(), group.getId(), target.getId(), NOW));
        });
        long notificationId = jdbc.queryForObject("select id from notifications", Long.class);
        var content = authenticated(target).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/{id}/push-content", notificationId);
        var denied = authenticated(other).queryParam("subscriptionId", subscription.getId())
                .queryParam("generation", subscription.getGeneration()).get("/notifications/{id}/push-content", notificationId);

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(2);
        assertThat(content.statusCode()).isEqualTo(200);
        assertThat(content.jsonPath().getInt("data.payloadVersion")).isEqualTo(1);
        assertThat(content.jsonPath().getMap("data.payload").keySet()).containsExactlyInAnyOrder("groupId", "invitationId");
        assertThat(content.jsonPath().getLong("data.payload.invitationId")).isEqualTo(issued.id());
        assertThat(content.asString()).doesNotContain("message", "token");
        assertThat(denied.statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("커밋 뒤 구독별 푸시 전송은 트랜잭션 밖에서 실행하고 외부 실패가 발생해도 초대와 알림을 유지한다.")
    void externalFailureKeepsInvitationAndRetriesOnlyFailedSubscription() {
        // Given
        Member inviter = member("101");
        Member target = member("102");
        Group group = group(inviter);
        var success = subscription(target, "success");
        subscription(target, "failure");
        invitations.createInvitation(inviter.getId(), group.getId(),
                new CreateInvitationCommand(InvitationType.DIRECT, target.getId(), UUID.randomUUID()));
        assertThat(transport.requests()).isEmpty();
        transport.respond(request -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            if (request.subscriptionId() == success.getId()) return PushResult.accepted();
            throw new IllegalStateException("외부 전송 실패");
        });

        // When
        worker.processDue();

        // Then
        awaitDeliveryProcessing();
        assertThat(transport.requests()).hasSize(2).allSatisfy(request -> assertThat(request.payloadVersion()).isEqualTo(1));
        assertThat(jdbc.queryForList("select status from notification_deliveries", String.class))
                .containsExactlyInAnyOrder("ACCEPTED", "RETRY");
        assertThat(jdbc.queryForObject("select count(*) from invitation", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(authenticated(target).get("/invitations/received").jsonPath().getList("data.items")).hasSize(1);
    }

    @Test
    @DisplayName("암호화 키가 없는 환경에서는 공유 링크 발급을 거부하고 지정 초대는 계속 제공한다.")
    void missingTokenKeyFailsLinkIssuanceWithoutBreakingDirectInvitations() {
        // Given
        Member inviter = member("101");
        Member target = member("102");
        Group group = group(inviter);

        // When
        var link = mutation(inviter).contentType("application/json")
                .body(Map.of("type", "LINK", "requestId", UUID.randomUUID())).post("/groups/{id}/invitations", group.getId());
        var direct = mutation(inviter).contentType("application/json")
                .body(Map.of("type", "DIRECT", "targetMemberId", target.getId(), "requestId", UUID.randomUUID()))
                .post("/groups/{id}/invitations", group.getId());

        // Then
        assertThat(link.statusCode()).isEqualTo(503);
        assertThat(link.jsonPath().getString("error.code")).isEqualTo("INVITATION_UNAVAILABLE");
        assertThat(direct.statusCode()).isEqualTo(201);
        assertThat(jdbc.queryForList("select type from invitation", String.class)).containsExactly("DIRECT");
    }

    private Group group(Member leader) {
        Group group = groups.save(Group.createClub("모임" + leader.getId(), "함께해요", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, leader, NOW));
        return group;
    }
}
