package com.project.jarihana.invitation.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Getter
@Entity
@Table(name = "invitation_acceptance", uniqueConstraints = @UniqueConstraint(
        name = "uk_invitation_acceptance_invitation_member", columnNames = {"invitation_id", "member_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InvitationAcceptance extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invitation_id", nullable = false)
    private Invitation invitation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "accepted_at", nullable = false)
    private LocalDateTime acceptedAt;

    private InvitationAcceptance(Invitation invitation, Member member, LocalDateTime acceptedAt) {
        super(acceptedAt);
        if (invitation == null || member == null || acceptedAt == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "초대·수락 회원·수락 시각은 필수입니다.");
        }
        if (acceptedAt.isBefore(invitation.getCreatedAt())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수락 시각은 초대 발급 시각보다 빠를 수 없습니다.");
        }
        if (invitation.getType() == InvitationType.DIRECT && !member.equals(invitation.getTargetMember())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "지정된 회원만 초대 수락 이력을 남길 수 있습니다.");
        }
        this.invitation = invitation;
        this.member = member;
        this.acceptedAt = acceptedAt;
    }

    public static InvitationAcceptance create(Invitation invitation, Member member, LocalDateTime acceptedAt) {
        return new InvitationAcceptance(invitation, member, acceptedAt);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) return true;
        return object instanceof InvitationAcceptance other && id != null && other.id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}
