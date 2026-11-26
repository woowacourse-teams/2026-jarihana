package com.project.jarihana.group.domain;

/**
 * 모임을 누구에게 보여 줄지 정한다.
 *
 * <p>비공개 모임은 현재 구성원만 볼 수 있고, 소속 공개 모임은 모임이 정한 소속의 회원도 볼 수 있다.
 */
public enum GroupVisibility {
    PUBLIC,
    PRIVATE,
    AFFILIATION_ONLY;

    /**
     * @param sameAffiliation 조회자가 모임이 정한 소속의 회원인지. 소속 공개가 아니면 쓰지 않는다.
     */
    public boolean isVisibleTo(boolean sameAffiliation, boolean groupMember) {
        return this == PUBLIC || groupMember || (this == AFFILIATION_ONLY && sameAffiliation);
    }

    /**
     * 비공개 모임은 초대로만 합류하므로 누구든 초대할 수 있고, 소속 공개 모임은 같은 소속만 초대할 수 있다.
     */
    public boolean allowsInvitationTo(boolean sameAffiliation) {
        return this != AFFILIATION_ONLY || sameAffiliation;
    }
}
