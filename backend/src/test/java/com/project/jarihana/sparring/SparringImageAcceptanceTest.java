package com.project.jarihana.sparring;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.command.service.ImageReferenceService;
import com.project.jarihana.image.domain.ImageReferenceType;
import com.project.jarihana.image.domain.ImageUploadStatus;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.ImageStorageStub;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.specification.RequestSpecification;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SparringImageAcceptanceTest extends IntegrationTestSupport {
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired ImageUploadCommandRepository uploads;
    @Autowired ImageReferenceRepository references;
    @Autowired ImageReferenceService referenceService;
    @Autowired ImageStorageStub storage;

    @Test
    @DisplayName("대표사진을 토론 전용 경로에 연결하고 공개 목록과 상세에서 보여준다")
    void attachesRepresentativeImageToPublicTopic() {
        // Given
        String token = member("대표사진", "sparring-image-owner");
        String temporaryKey = upload(token);

        // When
        long topicId = create(token, temporaryKey);
        String finalKey = "sparrings/" + topicId + "/" + temporaryKey.substring("groups/tmp/".length());
        String publicUrl = "https://service.example.test/api/images/" + finalKey;

        // Then
        given().get("/sparrings/" + topicId).then().statusCode(200)
                .body("data.representativeImageUrl", equalTo(publicUrl));
        given().get("/sparrings").then().statusCode(200)
                .body("data.items.representativeImageUrl", hasItem(publicUrl));
        given().redirects().follow(false).get("/images/" + finalKey).then().statusCode(302);
        assertThat(uploads.findByImageKey(temporaryKey)).isEmpty();
        var image = uploads.findByImageKey(finalKey).orElseThrow();
        assertThat(image.getStatus()).isEqualTo(ImageUploadStatus.ATTACHED);
        assertThat(image.getAttachedGroupId()).isNull();
        assertThat(image.getAttachedSparringId()).isEqualTo(topicId);
        assertThat(references.findAllByReferenceTypeAndOwnerId(ImageReferenceType.SPARRING_REPRESENTATIVE, topicId))
                .singleElement().satisfies(reference -> assertThat(reference.getGroupId()).isNull());

        // A group with the same numeric ID must not own or remove this image.
        referenceService.removeGroup(topicId, TestSupportConfig.FIXED_NOW);
        assertThat(references.existsByImageUploadId(image.getId())).isTrue();
    }

    @Test
    @DisplayName("대표사진 없이 토론을 만들면 이미지 URL은 비어 있다")
    void createsTopicWithoutRepresentativeImage() {
        // Given
        String token = member("사진선택", "sparring-image-optional");

        // When
        long topicId = create(token, null);

        // Then
        given().get("/sparrings/" + topicId).then().statusCode(200)
                .body("data.representativeImageUrl", nullValue());
    }

    @Test
    @DisplayName("다른 회원이 업로드한 사진으로 토론을 만들 수 없다")
    void rejectsAnotherMembersImageAndRollsBackTopic() {
        // Given
        String owner = member("사진주인", "sparring-image-uploader");
        String other = member("다른회원", "sparring-image-other");
        String key = upload(owner);

        // When / Then
        request(other).body(topic(key)).post("/sparrings").then().statusCode(400)
                .body("error.code", equalTo("IMAGE_NOT_FOUND"));
        given().queryParam("keyword", "대표사진 토론").get("/sparrings").then().statusCode(200)
                .body("data.items.size()", equalTo(0));
        assertThat(uploads.findByImageKey(key).orElseThrow().getStatus()).isEqualTo(ImageUploadStatus.TEMPORARY);
    }

    @Test
    @DisplayName("업로드되지 않은 사진이면 토론과 이미지 참조를 저장하지 않는다")
    void rejectsMissingImageObject() {
        // Given
        String token = member("미업로드", "sparring-image-missing");
        String key = upload(token);
        storage.markMissing(key);

        // When / Then
        request(token).body(topic(key)).post("/sparrings").then().statusCode(400)
                .body("error.code", equalTo("IMAGE_NOT_FOUND"));
        given().queryParam("keyword", "대표사진 토론").get("/sparrings").then().statusCode(200)
                .body("data.items.size()", equalTo(0));
    }

    private String member(String name, String github) {
        Member saved = members.save(Member.create(name, 23, github, Course.BACKEND));
        return tokens.issue(saved.getId()).value();
    }

    private String upload(String token) {
        return request(token).body(Map.of("fileName", "cover.webp", "contentType", "image/webp", "fileSize", 1024))
                .post("/image-uploads").then().statusCode(201).extract().jsonPath().getString("data.imageKey");
    }

    private long create(String token, String imageKey) {
        return request(token).body(topic(imageKey)).post("/sparrings").then().statusCode(201)
                .extract().jsonPath().getLong("data.id");
    }

    private Map<String, Object> topic(String imageKey) {
        Map<String, Object> body = new HashMap<>(Map.of("title", "대표사진 토론", "a", "좋아요", "b", "별로예요",
                "closesAt", "2099-01-01T00:00:00Z"));
        if (imageKey != null) body.put("representativeImageKey", imageKey);
        return body;
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().contentType("application/json").cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .cookie(cookies.accessTokenName(), token);
    }
}
