package com.project.jarihana.image.client;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.project.jarihana.image.config.ImageProperties;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

class S3ImageStorageTest {

    private final S3Client client = mock(S3Client.class);
    private final S3Presigner presigner = mock(S3Presigner.class);

    @DisplayName("prod와 dev는 각 환경의 정확한 이미지 경로에만 삭제를 요청한다.")
    @ParameterizedTest
    @ValueSource(strings = {"prod", "dev"})
    void deletesOnlyWithinEnvironmentImagePrefix(String profile) {
        // Given
        String prefix = profile.equals("prod") ? "jarihana/images" : "jarihana-dev/images";
        S3ImageStorage storage = storage(profile, prefix);

        // When
        storage.delete("groups/tmp/fixture.jpg");

        // Then
        verify(client).deleteObject(DeleteObjectRequest.builder()
                .bucket("techcourse-project-2026")
                .key(prefix + "/groups/tmp/fixture.jpg")
                .build());
    }

    @DisplayName("비정상 이미지 키는 S3 조회·복사·삭제와 업로드 서명을 모두 차단한다.")
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "../other-team/photo.jpg", "groups/tmp/../../photo.jpg",
            "groups/tmp/photo.jpg/", "/groups/tmp/photo.jpg", "groups/tmp/photo%2Fname.jpg",
            "s3://other-team/photo.jpg", "images/default-group.png", "frontend/index.html"})
    void rejectsInvalidKeysBeforeAnySdkCall(String key) {
        // Given
        S3ImageStorage storage = storage("prod", "jarihana/images");

        // When / Then
        assertThatThrownBy(() -> storage.delete(key)).isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.copy(key, "groups/1/fixture.jpg"))
                .isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.copy("groups/tmp/fixture.jpg", key))
                .isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.exists(key)).isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.metadata(key)).isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.issueUploadUrl(key, "image/jpeg", Duration.ofMinutes(30)))
                .isInstanceOf(ImageStorageException.class);
        verifyNoInteractions(client, presigner);
    }

    @DisplayName("local과 test 및 미지정 프로필은 실제 공유 S3 호출을 차단한다.")
    @ParameterizedTest
    @ValueSource(strings = {"local", "test", ""})
    void blocksSharedS3OutsideDeploymentProfiles(String profile) {
        // Given
        S3ImageStorage storage = storage(profile, "jarihana/images");

        // When / Then
        assertThatThrownBy(() -> storage.delete("groups/tmp/fixture.jpg"))
                .isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.issueUploadUrl(
                "groups/tmp/fixture.jpg", "image/jpeg", Duration.ofMinutes(30)))
                .isInstanceOf(ImageStorageException.class);
        verifyNoInteractions(client, presigner);
    }

    @DisplayName("정상 그룹과 토론 이미지의 삭제를 허용한다.")
    @ParameterizedTest
    @ValueSource(strings = {"groups/12/fixture.webp", "sparrings/7/fixture.png"})
    void acceptsManagedFinalKeys(String key) {
        // Given
        S3ImageStorage storage = storage("prod", "jarihana/images");

        // When
        storage.delete(key);

        // Then
        verify(client).deleteObject(any(DeleteObjectRequest.class));
    }

    @DisplayName("시작 시 검증을 통과했어도 각 S3 호출 직전에 설정을 다시 확인한다.")
    @Test
    void revalidatesConfigurationBeforeEveryRequest() {
        // Given
        ImageProperties properties = mock(ImageProperties.class);
        when(properties.bucket()).thenReturn("techcourse-project-2026");
        when(properties.region()).thenReturn("ap-northeast-2");
        when(properties.keyPrefix()).thenReturn("jarihana/images");
        ImageStorageScope scope = ImageStorageScope.from(properties, "prod");
        S3ImageStorage storage = new S3ImageStorage(presigner, client, scope);
        when(properties.keyPrefix()).thenReturn("other-team/images");

        // When / Then
        assertThatThrownBy(() -> storage.delete("groups/tmp/fixture.jpg"))
                .isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.copy("groups/tmp/fixture.jpg", "groups/1/fixture.jpg"))
                .isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> storage.issueUploadUrl(
                "groups/tmp/fixture.jpg", "image/jpeg", Duration.ofMinutes(30)))
                .isInstanceOf(ImageStorageBoundaryException.class);
        verifyNoInteractions(client, presigner);
    }

    private S3ImageStorage storage(String profile, String prefix) {
        ImageProperties properties = new ImageProperties(
                "techcourse-project-2026", "ap-northeast-2", prefix,
                null, null, null, null, null, null, 0, null, false, null, null, 0, 0);
        return new S3ImageStorage(presigner, client, ImageStorageScope.from(properties, profile));
    }
}
