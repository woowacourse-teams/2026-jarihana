package com.project.jarihana.group.config;

import com.project.jarihana.support.IntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static java.util.Map.entry;
import static org.assertj.core.api.Assertions.assertThat;

class GroupVisibilityRouteCoverageTest extends IntegrationTestSupport {

    private static final List<String> GROUP_PACKAGES = List.of(
            "group", "groupmember", "groupmusic", "groupspace", "recruitment", "registration",
            "invitation", "announcement", "activitypost", "chat", "notification", "share"
    );

    /**
     * 경로 변수로 모임을 찾을 수 없어 인터셉터가 막지 못하는 API와 막는 방법. 새 API가 여기에도 규칙에도 없으면
     * 테스트가 실패하므로, 크루 전용 모임을 어떻게 숨길지 정한 뒤 이 표에 적는다.
     */
    private static final Map<String, String> NOT_PATH_GUARDED = Map.ofEntries(
            entry("GET /groups", "목록 SQL 조건: GroupJpaRepository.findPage"),
            entry("GET /home", "목록 SQL 조건: GroupJpaRepository.findPage"),
            entry("POST /groups", "모임 생성. 기존 모임을 읽지 않는다"),
            entry("GET /share/groups/{groupId}", "CloudFront 공개 캐시 때문에 크루 전용이면 정보 없는 일반 미리보기"),
            entry("GET /activity-posts", "목록 SQL 조건: ActivityPostQueryRepository.findPage"),
            entry("GET /registrations", "목록 SQL 조건: RegistrationListJpaRepository.findMyPage"),
            entry("GET /invitations/received", "목록 SQL 조건: InvitationQueryRepository.findReceived"),
            entry("GET /invitations/links/{token}", "서비스 판정: InvitationQueryService.previewLink"),
            entry("GET /notifications", "목록 SQL 조건: NotificationQueryRepository.findPage"),
            entry("GET /notifications/unread-count", "SQL 조건: NotificationQueryRepository.countUnread"),
            entry("GET /notifications/{id}", "SQL 조건: NotificationQueryRepository.findActiveByIdAndMemberId"),
            entry("GET /notifications/{id}/push-content", "SQL 조건: NotificationQueryRepository.findActiveByIdAndMemberId"),
            entry("PATCH /notifications/{id}/read", "본인 알림의 읽음 표시만 바꾸고 내용을 돌려주지 않는다"),
            entry("PATCH /notifications/read-all", "본인 알림의 읽음 표시만 바꾸고 내용을 돌려주지 않는다"),
            entry("DELETE /notifications/{id}", "본인 알림을 지우기만 하고 내용을 돌려주지 않는다"),
            entry("GET /chats", "현재 구성원인 모임의 채팅방만 돌려준다"),
            entry("GET /group-spaces/furniture-catalog", "모임과 무관한 공용 가구 목록"),
            entry("GET /group-spaces/blueprints/{templateKey}/default", "모임과 무관한 공용 도면"),
            entry("GET /group-spaces/weather", "모임과 무관한 날씨")
    );

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping mapping;

    @DisplayName("모임을 드러낼 수 있는 API는 인터셉터 규칙에 걸리거나 막는 방법이 표에 적혀 있어야 한다.")
    @Test
    void everyGroupRouteIsGuardedOrClassified() {
        // Given
        Set<String> unclassified = new TreeSet<>();

        // When
        mapping.getHandlerMethods().forEach((info, handler) -> {
            String type = handler.getBeanType().getName();
            if (GROUP_PACKAGES.stream().noneMatch(name -> type.startsWith("com.project.jarihana." + name + "."))) {
                return;
            }
            for (String pattern : info.getPatternValues()) {
                if (GroupVisibilityGuard.guards(pattern)) {
                    continue;
                }
                info.getMethodsCondition().getMethods().forEach(method -> {
                    String route = method + " " + pattern;
                    if (!NOT_PATH_GUARDED.containsKey(route)) {
                        unclassified.add(route);
                    }
                });
            }
        });

        // Then
        assertThat(unclassified).as("인터셉터 규칙에도 표에도 없는 API").isEmpty();
    }

    @DisplayName("표에 적힌 API는 실제로 있어야 한다.")
    @Test
    void classifiedRoutesStillExist() {
        // Given
        Set<String> routes = new TreeSet<>();

        // When
        mapping.getHandlerMethods().forEach((info, handler) -> info.getPatternValues().forEach(pattern ->
                info.getMethodsCondition().getMethods().forEach(method -> routes.add(method + " " + pattern))));

        // Then
        assertThat(routes).containsAll(NOT_PATH_GUARDED.keySet());
    }

    @DisplayName("같은 이름의 경로 변수를 쓰는 다른 기능의 API는 막지 않는다.")
    @Test
    void doesNotGuardOtherFeaturesWithSameVariableNames() {
        // When & Then
        assertThat(GroupVisibilityGuard.guards("/proposal-comments/{commentId}")).isFalse();
        assertThat(GroupVisibilityGuard.guards("/share/groups/{groupId}")).isFalse();
        assertThat(GroupVisibilityGuard.guards("/groups/{groupId}/recruitments/{recruitmentId}")).isTrue();
        assertThat(GroupVisibilityGuard.guards("/activity-post-comments/{commentId}/reactions/{emoji}")).isTrue();
    }
}
