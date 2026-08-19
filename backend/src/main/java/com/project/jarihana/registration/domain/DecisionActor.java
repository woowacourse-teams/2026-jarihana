package com.project.jarihana.registration.domain;

import java.util.Objects;

public final class DecisionActor {

    private final DecisionActorType type;
    private final Long memberId;

    private DecisionActor(DecisionActorType type, Long memberId) {
        this.type = type;
        this.memberId = memberId;
    }

    public static DecisionActor system() {
        return new DecisionActor(DecisionActorType.SYSTEM, null);
    }

    public static DecisionActor member(Long memberId) {
        if (memberId == null) {
            throw new IllegalArgumentException("회원 결정 주체에는 회원 ID가 필요합니다.");
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
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof DecisionActor that)) {
            return false;
        }
        return type == that.type && Objects.equals(memberId, that.memberId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(type, memberId);
    }
}
