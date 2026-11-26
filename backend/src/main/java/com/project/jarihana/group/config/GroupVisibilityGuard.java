package com.project.jarihana.group.config;

/**
 * 크루 전용 모임을 숨기는 인터셉터가 경로 변수로 모임을 찾는 규칙이다.
 *
 * <p>같은 이름의 경로 변수를 다른 기능도 쓰므로(예: {@code /proposal-comments/{commentId}}) 경로 접두사와 함께
 * 맞춘다. 앞에 둔 규칙부터 판정해, 모임 ID가 있는 경로는 모임 기준 404를 먼저 낸다.
 */
public enum GroupVisibilityGuard {
    GROUP("/groups/{groupId}", "groupId"),
    RECRUITMENT("/recruitments/{recruitmentId}", "recruitmentId"),
    ACTIVITY_POST("/activity-posts/{postId}", "postId"),
    ACTIVITY_POST_COMMENT("/activity-post-comments/{commentId}", "commentId"),
    INVITATION("/invitations/{invitationId}", "invitationId");

    private final String pathPrefix;
    private final String variable;

    GroupVisibilityGuard(String pathPrefix, String variable) {
        this.pathPrefix = pathPrefix;
        this.variable = variable;
    }

    public static boolean guards(String pattern) {
        for (GroupVisibilityGuard guard : values()) {
            if (guard.appliesTo(pattern)) {
                return true;
            }
        }
        return false;
    }

    public boolean appliesTo(String pattern) {
        return pattern.equals(pathPrefix) || pattern.startsWith(pathPrefix + "/");
    }

    public String variable() {
        return variable;
    }
}
