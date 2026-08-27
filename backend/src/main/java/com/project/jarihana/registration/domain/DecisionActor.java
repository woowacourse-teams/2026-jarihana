package com.project.jarihana.registration.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;

import java.util.Objects;

@Embeddable
public class DecisionActor {

    @Enumerated(EnumType.STRING)
    @Column(name = "decided_by_type")
    private DecisionActorType type;

    @Column(name = "decided_by_member_id")
    private Long memberId;

    protected DecisionActor() {
    }

    private DecisionActor(DecisionActorType type, Long memberId) {
        this.type = type;
        this.memberId = memberId;
    }

    public static DecisionActor system() {
        return new DecisionActor(DecisionActorType.SYSTEM, null);
    }

    public static DecisionActor member(Long memberId) {
        if (memberId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "회원 결정 주체에는 회원 ID가 필요합니다.");
        }
        return new DecisionActor(DecisionActorType.MEMBER, memberId);
    }

    public DecisionActorType getType() {
        return type;
    }

    public Long getMemberId() {
        return memberId;
    }

    @Override
    public int hashCode() {
        return Objects.hash(type, memberId);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof DecisionActor that)) {
            return false;
        }
        return type == that.type && Objects.equals(memberId, that.memberId);
    }
}
