package com.project.jarihana.image;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.domain.ImageReference;
import com.project.jarihana.image.domain.ImageReferenceType;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ImageAccessAcceptanceTest extends IntegrationTestSupport {

    @Autowired
    private ImageUploadCommandRepository uploadRepository;

    @Autowired
    private ImageReferenceRepository referenceRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("참조 중인 이미지는 비로그인 사용자도 5분 이내 전달 URL로 이동한다.")
    @Test
    void redirectsReferencedImage() {
        ImageUpload upload = saveUpload("groups/12/active.webp", null);
        referenceRepository.save(ImageReference.create(
                upload.getId(),
                ImageReferenceType.GROUP_REPRESENTATIVE,
                12L,
                12L,
                TestSupportConfig.FIXED_NOW
        ));

        given()
                .redirects().follow(false)
                .when()
                .get("/images/groups/12/active.webp")
                .then()
                .statusCode(302)
                .header("Cache-Control", equalTo("private, no-store"))
                .header("Location", equalTo("https://service.example.test/images/groups/12/active.webp"));
    }

    @DisplayName("임시 이미지는 만료 전 업로더에게만 프리뷰를 허용한다.")
    @Test
    void previewsTemporaryImageOnlyForUploader() {
        Member uploader = memberRepository.save(Member.create(
                "업로더", 8, "github-image-preview-owner", Course.BACKEND));
        Member other = memberRepository.save(Member.create(
                "다른회원", 8, "github-image-preview-other", Course.BACKEND));
        saveUpload("groups/tmp/preview.webp", uploader.getId());

        given()
                .redirects().follow(false)
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(uploader.getId()).value())
                .when()
                .get("/images/groups/tmp/preview.webp")
                .then()
                .statusCode(302);

        given()
                .redirects().follow(false)
                .cookie(authCookieProperties.accessTokenName(), accessTokenProvider.issue(other.getId()).value())
                .when()
                .get("/images/groups/tmp/preview.webp")
                .then()
                .statusCode(400)
                .body("error.code", equalTo("IMAGE_NOT_FOUND"));

        given()
                .redirects().follow(false)
                .when()
                .get("/images/groups/tmp/preview.webp")
                .then()
                .statusCode(400)
                .body("error.code", equalTo("IMAGE_NOT_FOUND"));
    }

    private ImageUpload saveUpload(String imageKey, Long uploaderId) {
        return uploadRepository.save(ImageUpload.create(
                UUID.randomUUID(),
                "image.webp",
                "image/webp",
                1024,
                imageKey,
                TestSupportConfig.FIXED_NOW.plusMinutes(30),
                TestSupportConfig.FIXED_NOW,
                uploaderId
        ));
    }
}
