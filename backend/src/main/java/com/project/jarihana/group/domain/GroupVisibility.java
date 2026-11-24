package com.project.jarihana.group.domain;

import com.project.jarihana.member.domain.MemberType;

/**
 * 모임을 누구에게 보여 줄지 정한다.
 *
 * <p>비공개 모임은 현재 구성원만 볼 수 있고, 크루 공개 모임은 크루도 볼 수 있다.
 */
public enum GroupVisibility {
    PUBLIC,
    PRIVATE,
    CREW_ONLY;

    public boolean isVisibleTo(MemberType viewerType, boolean groupMember) {
        return this == PUBLIC || groupMember || (this == CREW_ONLY && viewerType == MemberType.CREW);
    }

    public boolean allowsInvitationTo(MemberType inviteeType) {
        return this != CREW_ONLY || inviteeType == MemberType.CREW;
    }
}
