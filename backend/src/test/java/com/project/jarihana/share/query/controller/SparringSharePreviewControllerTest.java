package com.project.jarihana.share.query.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.sparring.command.repository.SparringTopicCommandRepository;
import com.project.jarihana.sparring.domain.SparringTopic;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.specification.RequestSpecification;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SparringSharePreviewControllerTest extends IntegrationTestSupport {

    @Autowired MemberRepository members;
    @Autowired SparringTopicCommandRepository topics;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;

    @Test
    @DisplayName("익명 크롤러에게 토론명과 양쪽 편명 및 기본 사진의 공유 HTML을 반환한다")
    void rendersPublicSparringMetadata() {
        // Given
        long topicId = createTopic(memberToken(), "탕수육 먹는 법", "부먹", "찍먹", null);
        String canonicalUrl = "http://localhost:5173/sparring/" + topicId;

        // When / Then
        given().queryParam("promotion_id", "debate_share").queryParam("private", "discard")
                .get("/share/sparrings/{topicId}", topicId).then()
                .statusCode(200)
                .contentType(containsString("text/html"))
                .header("Cache-Control", equalTo("max-age=300, public"))
                .body(containsString("<meta property=\"og:title\" content=\"탕수육 먹는 법 | 토론해요 &middot; 자리하나\""))
                .body(containsString("<meta property=\"og:description\" content=\"부먹 vs 찍먹\""))
                .body(containsString("<meta name=\"twitter:title\" content=\"탕수육 먹는 법 | 토론해요 &middot; 자리하나\""))
                .body(containsString("<meta name=\"twitter:description\" content=\"부먹 vs 찍먹\""))
                .body(containsString("<link rel=\"canonical\" href=\"" + canonicalUrl + "\""))
                .body(containsString("<meta property=\"og:url\" content=\"" + canonicalUrl + "\""))
                .body(containsString("content=\"http://localhost:5173/sparring-arena/assets/entry-rivals.webp\""))
                .body(containsString(canonicalUrl + "?preview=1"))
                .body(not(containsString("promotion_id=debate_share")))
                .body(not(containsString("discard")))
                .body(not(containsString("우세")))
                .body(not(containsString("투표")));
    }

    @Test
    @DisplayName("대표사진이 있는 토론은 크롤러가 접근할 수 있는 안정된 이미지 주소를 사용한다")
    void usesAttachedRepresentativeImage() {
        // Given
        String token = memberToken();
        String imageKey = request(token)
                .body(Map.of("fileName", "cover.webp", "contentType", "image/webp", "fileSize", 1024))
                .post("/image-uploads").then().statusCode(201)
                .extract().jsonPath().getString("data.imageKey");
        long topicId = createTopic(token, "사진이 있는 토론", "찬성", "반대", imageKey);
        String finalKey = "sparrings/" + topicId + "/" + imageKey.substring("groups/tmp/".length());
        String publicUrl = "https://service.example.test/api/images/" + finalKey;

        // When / Then
        given().get("/share/sparrings/{topicId}", topicId).then().statusCode(200)
                .body(containsString("<meta property=\"og:image\" content=\"" + publicUrl + "\""))
                .body(containsString("<meta name=\"twitter:image\" content=\"" + publicUrl + "\""));
        given().redirects().follow(false).get("/images/" + finalKey).then().statusCode(302);
    }

    @Test
    @DisplayName("토론명과 편명에 포함된 HTML 특수문자를 이스케이프한다")
    void escapesTitleAndSideNames() {
        // Given
        long topicId = createTopic(memberToken(), "A&B \"토론\" %s", "<민트>", "\"코랄\"", null);

        // When / Then
        given().get("/share/sparrings/{topicId}", topicId).then().statusCode(200)
                .body(containsString("A&amp;B &quot;토론&quot; %s | 토론해요 &middot; 자리하나"))
                .body(containsString("&lt;민트&gt; vs &quot;코랄&quot;"))
                .body(not(containsString("content=\"A&B")))
                .body(not(containsString("<민트>")));
    }

    @Test
    @DisplayName("투표로 우세가 바뀌어도 공유 카드 내용은 바뀌지 않는다")
    void excludesChangingVoteResults() {
        // Given
        String token = memberToken();
        long topicId = createTopic(token, "고정된 공유 카드", "민트", "코랄", null);
        String before = given().get("/share/sparrings/{topicId}", topicId)
                .then().statusCode(200).extract().asString();

        // When
        request(token).body(Map.of("side", "MINT"))
                .post("/sparrings/{topicId}/votes", topicId).then().statusCode(204);

        // Then
        given().get("/sparrings/{topicId}", topicId).then().statusCode(200)
                .body("data.votesA", equalTo(1));
        String after = given().get("/share/sparrings/{topicId}", topicId)
                .then().statusCode(200).extract().asString();
        assertThat(after).isEqualTo(before);
    }

    @Test
    @DisplayName("마감된 토론도 공유 미리보기를 공개 조회할 수 있다")
    void rendersClosedTopic() {
        // Given
        Member member = members.save(Member.create("공유", 23, "share-closed", Course.BACKEND));
        var now = TestSupportConfig.FIXED_NOW;
        SparringTopic topic = topics.save(SparringTopic.create(
                "마감된 토론", "찬성", "반대", "", member, now.minusDays(2), now.minusDays(1)));

        // When / Then
        given().get("/share/sparrings/{topicId}", topic.getId()).then().statusCode(200)
                .body(containsString("마감된 토론 | 토론해요 &middot; 자리하나"));
    }

    @Test
    @DisplayName("존재하지 않는 토론의 공유 미리보기는 404를 반환한다")
    void returnsNotFoundForMissingTopic() {
        // Given / When / Then
        given().get("/share/sparrings/{topicId}", 999_999L).then().statusCode(404)
                .body("error.code", equalTo("SPARRING_NOT_FOUND"));
    }

    private String memberToken() {
        Member member = members.save(Member.create("공유", 23, "share-preview", Course.BACKEND));
        return tokens.issue(member.getId()).value();
    }

    private long createTopic(String token, String title, String a, String b, String imageKey) {
        Map<String, Object> body = new HashMap<>(Map.of(
                "title", title, "a", a, "b", b, "closesAt", "2099-01-01T00:00:00Z"));
        if (imageKey != null) body.put("representativeImageKey", imageKey);
        return request(token).body(body).post("/sparrings").then().statusCode(201)
                .extract().jsonPath().getLong("data.id");
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().contentType("application/json").cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf).cookie(cookies.accessTokenName(), token);
    }
}
