package com.project.jarihana.member.domain;

import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * 한 회원이 확인된 소속 ID 묶음이다. 비로그인 조회자와 소속이 없는 회원은 {@link #none()}이다.
 */
public final class VerifiedAffiliations {

    private static final VerifiedAffiliations NONE = new VerifiedAffiliations(Set.of());

    private final Set<Long> affiliationIds;

    private VerifiedAffiliations(Set<Long> affiliationIds) {
        this.affiliationIds = affiliationIds;
    }

    public static VerifiedAffiliations from(Collection<Long> affiliationIds) {
        if (affiliationIds == null || affiliationIds.isEmpty()) {
            return NONE;
        }
        return new VerifiedAffiliations(Set.copyOf(affiliationIds));
    }

    public static VerifiedAffiliations of(Long... affiliationIds) {
        return from(List.of(affiliationIds));
    }

    public static VerifiedAffiliations none() {
        return NONE;
    }

    public boolean includes(Long affiliationId) {
        return affiliationId != null && affiliationIds.contains(affiliationId);
    }
}
