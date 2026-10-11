package com.project.jarihana.invitation.repository;

import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.invitation.command.repository.InvitationAcceptanceCommandRepository;
import com.project.jarihana.invitation.command.repository.InvitationCommandRepository;
import com.project.jarihana.invitation.domain.Invitation;
import com.project.jarihana.invitation.domain.InvitationAcceptance;
import com.project.jarihana.invitation.domain.InvitationType;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.ApprovalOrigin;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InvitationStorageTest extends IntegrationTestSupport {
    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;
    @Autowired private GroupCommandRepository groups;
    @Autowired private MemberRepository members;
    @Autowired private InvitationCommandRepository invitations;
    @Autowired private InvitationAcceptanceCommandRepository acceptances;
    @Autowired private GroupMemberCommandRepository groupMembers;
    @Autowired private GroupRecruitmentCommandRepository recruitments;
    @Autowired private RegistrationCommandRepository registrations;
    @Autowired private PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("두 초대 유형과 수락 이력을 저장하고 기존 일반 승인 출처를 함께 조회한다.")
    void storeBothInvitationTypesAndOrdinaryApproval() {
        // Given
        Fixture fixture = fixture();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        // When & Then
        transaction.executeWithoutResult(status -> {
            Invitation direct = invitations.save(Invitation.issueDirect(fixture.group(), fixture.inviter(), fixture.first(), UUID.randomUUID(), NOW));
            Invitation link = invitations.save(Invitation.issueLink(fixture.group(), fixture.inviter(), UUID.randomUUID(), "a".repeat(64), "encrypted-value", NOW));
            acceptances.save(InvitationAcceptance.create(link, fixture.first(), NOW.plusMinutes(1)));
            acceptances.save(InvitationAcceptance.create(link, fixture.second(), NOW.plusMinutes(2)));
            GroupRecruitment recruitment = recruitments.save(GroupRecruitment.create(fixture.group(), JoinMethod.AUTO,
                    3, NOW, NOW.plusDays(1)));
            Registration ordinary = registrations.save(Registration.createAutoApproved(recruitment, fixture.first(), null, NOW, 0));
            assertThat(invitations.findById(direct.getId()).orElseThrow().getType()).isEqualTo(InvitationType.DIRECT);
            assertThat(invitations.findByTokenHash("a".repeat(64)).orElseThrow().getEncryptedToken()).isEqualTo("encrypted-value");
            assertThat(invitations.findByInviterMemberIdAndRequestId(fixture.inviter().getId(), link.getRequestId()))
                    .map(Invitation::getId).contains(link.getId());
            assertThat(acceptances.findByInvitationIdAndMemberId(link.getId(), fixture.first().getId())).isPresent();
            assertThat(acceptances.findByInvitationIdAndMemberId(link.getId(), fixture.second().getId())).isPresent();
            assertThat(registrations.findById(ordinary.getId()).orElseThrow().getApprovalOrigin()).isEqualTo(ApprovalOrigin.RECRUITMENT);
        });
    }

    @Test
    @DisplayName("실제 DB는 같은 초대·회원 수락과 같은 모임·회원 소속을 중복 저장하지 않는다.")
    void databaseRejectsDuplicateAcceptanceAndMembership() {
        // Given
        Fixture fixture = fixture();
        Invitation invitation = invitations.save(Invitation.issueLink(fixture.group(), fixture.inviter(), UUID.randomUUID(), "a".repeat(64), "encrypted-value", NOW));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.executeWithoutResult(status -> {
            acceptances.save(InvitationAcceptance.create(invitation, fixture.first(), NOW.plusMinutes(1)));
            groupMembers.save(GroupMember.createMember(fixture.group(), fixture.first(), NOW));
        });
        // When & Then
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                acceptances.save(InvitationAcceptance.create(invitation, fixture.first(), NOW.plusMinutes(2)))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                groupMembers.save(GroupMember.createMember(fixture.group(), fixture.first(), NOW))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("같은 발급 요청과 공유 토큰 해시는 실제 DB에서 중복할 수 없다.")
    void databaseRejectsDuplicateIssueRequestAndTokenHash() {
        // Given
        Fixture fixture = fixture();
        UUID requestId = UUID.randomUUID();
        invitations.save(Invitation.issueLink(fixture.group(), fixture.inviter(), requestId,
                "a".repeat(64), "encrypted-value", NOW));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        // When & Then
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                invitations.save(Invitation.issueDirect(fixture.group(), fixture.inviter(), fixture.first(), requestId, NOW))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                invitations.save(Invitation.issueLink(fixture.group(), fixture.inviter(), UUID.randomUUID(),
                        "a".repeat(64), "encrypted-value", NOW))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Fixture fixture() {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        return transaction.execute(status -> new Fixture(
                groups.save(Group.createClub("초대 저장 모임", "함께해요", null, null, null, NOW)),
                members.save(Member.create("우주", 8, "100", Course.BACKEND)),
                members.save(Member.create("마루", 8, "101", Course.FRONTEND)),
                members.save(Member.create("하늘", 8, "102", Course.BACKEND))));
    }

    private record Fixture(Group group, Member inviter, Member first, Member second) {
    }
}
