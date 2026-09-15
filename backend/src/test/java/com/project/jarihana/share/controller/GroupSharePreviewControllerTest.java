package com.project.jarihana.share.controller;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.support.IntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;

class GroupSharePreviewControllerTest extends IntegrationTestSupport {

    private static final LocalDateTime CREATED_AT = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Autowired
    private GroupJpaRepository groupRepository;

    @DisplayName("그룹 공유 미리보기 HTML에 그룹별 Open Graph 메타데이터를 포함한다.")
    @Test
    void rendersGroupMetadataForSocialPreview() {
        // Given
        Group group = groupRepository.save(Group.createStudy(
                "알고리즘 스터디",
                "매주 함께 문제를 풉니다.",
                "문제 풀이와 코드 리뷰를 진행합니다.",
                "groups/1.webp",
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.NOON, LocalTime.of(13, 0)),
                CREATED_AT
        ));

        // When / Then
        given()
                .when()
                .get("/share/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .contentType(containsString("text/html"))
                .body(containsString("<meta property=\"og:title\" content=\"알고리즘 스터디 | 자리하나\""))
                .body(containsString("<meta property=\"og:description\" content=\"매주 함께 문제를 풉니다.\""))
                .body(containsString("<meta property=\"og:url\" content=\"http://localhost:5173/groups/" + group.getId() + "\""))
                .body(containsString("<meta property=\"og:image\" content=\"https://cdn.example.test/images/groups/1.webp\""))
                .body(containsString("http://localhost:5173/groups/" + group.getId() + "?preview=1"));
    }

    @DisplayName("존재하지 않는 그룹의 공유 미리보기는 404를 반환한다.")
    @Test
    void returnsNotFoundForMissingGroup() {
        // Given / When / Then
        given()
                .when()
                .get("/share/groups/{groupId}", 999_999L)
                .then()
                .statusCode(404)
                .body("error.code", equalTo("GROUP_NOT_FOUND"));
    }

    @DisplayName("그룹 메타데이터의 HTML 특수문자를 안전하게 이스케이프한다.")
    @Test
    void escapesHtmlMetadata() {
        // Given
        Group group = groupRepository.save(Group.createStudy(
                "A&B 스터디",
                "소개 \"한 줄\"",
                null,
                null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.NOON, LocalTime.of(13, 0)),
                CREATED_AT
        ));

        // When / Then
        given()
                .when()
                .get("/share/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .body(containsString("A&amp;B 스터디 | 자리하나"))
                .body(containsString("소개 &quot;한 줄&quot;"))
                .body(not(containsString("content=\"A&B 스터디")));
    }
}
