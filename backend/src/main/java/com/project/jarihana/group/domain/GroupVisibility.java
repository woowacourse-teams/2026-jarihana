package com.project.jarihana.group.domain;

import com.project.jarihana.member.domain.MemberType;

/**
 * 모임을 누구에게 보여 줄지 정한다.
 *
 * <p>{@code CREW_ONLY}는 크루와 그 모임의 현재 구성원에게만 보인다. 크루 전용으로 바뀌기 전에 들어온
 * 비크루 구성원도 구성원인 동안은 계속 볼 수 있다.
 */
public enum GroupVisibility {
    PUBLIC,
    CREW_ONLY;

    public boolean isVisibleTo(MemberType viewerType, boolean groupMember) {
        return this == PUBLIC || groupMember || viewerType == MemberType.CREW;
    }

    public boolean admits(MemberType joinerType) {
        return this == PUBLIC || joinerType == MemberType.CREW;
    }
}
