package com.project.jarihana.member.domain;

/**
 * {@code MEMBER}는 소속을 묻지 않고 가입한 기본 멤버다. 우테코 크루 명단으로 인증하면 {@code CREW}가 된다.
 */
public enum MemberType {
    CREW,
    COACH,
    BOOTCAMP,
    PROFESSIONAL,
    MEMBER
}
