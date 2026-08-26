package com.project.jarihana.image.command.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ImageUploadCommandControllerTest extends IntegrationTestSupport {

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("회원은 이미지 업로드용 Presigned URL을 발급받는다.")
    @Test
    void createsImageUpload() {
        Member member = memberRepository.save(Member.create("가온", 20, "github-image-upload", Course.BACKEND));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken();

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("""
                        {
                          "fileName": "group.webp",
                          "contentType": "image/webp",
                          "fileSize": 1048576
                        }
                        """)
                .when()
                .post("/image-uploads")
                .then()
                .statusCode(201)
                .body("success", equalTo(true))
                .body("data.imageKey", containsString("groups/tmp/"))
                .body("data.imageKey", containsString(".webp"))
                .body("data.uploadUrl", containsString("https://upload.example.test/"))
                .body("data.expiresAt", equalTo("2026-08-19T10:10:00"))
                .body("error", equalTo(null));
    }

    @DisplayName("허용하지 않는 콘텐츠 타입의 이미지 업로드는 거부한다.")
    @Test
    void rejectsUnsupportedContentType() {
        Member member = memberRepository.save(Member.create("가온", 21, "github-image-upload-type", Course.BACKEND));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken();

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"fileName\":\"group.svg\",\"contentType\":\"image/svg+xml\",\"fileSize\":1000}")
                .when()
                .post("/image-uploads")
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("IMAGE_CONTENT_TYPE_NOT_ALLOWED"));
    }

    @DisplayName("최대 크기를 초과한 이미지 업로드는 거부한다.")
    @Test
    void rejectsOversizedImage() {
        Member member = memberRepository.save(Member.create("가온", 22, "github-image-upload-size", Course.BACKEND));
        String accessToken = accessTokenProvider.issue(member.getId()).value();
        String csrfToken = csrfToken();

        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body("{\"fileName\":\"group.webp\",\"contentType\":\"image/webp\",\"fileSize\":5242881}")
                .when()
                .post("/image-uploads")
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("error.code", equalTo("IMAGE_FILE_TOO_LARGE"));
    }

    private String csrfToken() {
        ExtractableResponse<Response> response = given()
                .when()
                .get("/groups?size=1")
                .then()
                .extract();
        return response.cookie("XSRF-TOKEN");
    }
}
