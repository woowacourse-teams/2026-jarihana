package com.project.jarihana.image.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.image.config.ImageProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ImageStorageScopeTest {

    @DisplayName("미지정 또는 잘못된 prefix는 prod 설정을 거부한다.")
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "/", "jarihana", "jarihana/images/", "jarihana/images-other",
            "other-team/images", "jarihana-dev/images", "jarihana/images/../images"})
    void rejectsMissingAndUnexpectedProductionPrefix(String prefix) {
        // Given / When / Then
        assertThatThrownBy(() -> ImageStorageScope.from(properties("techcourse-project-2026", prefix), "prod"))
                .isInstanceOf(ImageStorageBoundaryException.class);
    }

    @DisplayName("미지정 또는 다른 bucket은 배포 환경에서 거부한다.")
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "other-team-bucket", "techcourse-project-2026/"})
    void rejectsMissingAndUnexpectedBucket(String bucket) {
        // Given / When / Then
        assertThatThrownBy(() -> ImageStorageScope.from(properties(bucket, "jarihana/images"), "prod"))
                .isInstanceOf(ImageStorageBoundaryException.class);
    }

    @DisplayName("dev에서 운영 이미지 경로를 사용하면 거부한다.")
    @Test
    void rejectsProductionPrefixInDevelopment() {
        // Given / When / Then
        assertThatThrownBy(() -> ImageStorageScope.from(
                properties("techcourse-project-2026", "jarihana/images"), "dev"))
                .isInstanceOf(ImageStorageBoundaryException.class);
    }

    @DisplayName("배포 프로필이 혼재하거나 local 정리를 켜면 거부한다.")
    @Test
    void rejectsAmbiguousDeploymentAndLocalCleanup() {
        // Given
        ImageProperties properties = properties("techcourse-project-2026", "jarihana/images");

        // When / Then
        assertThatThrownBy(() -> ImageStorageScope.from(properties, "prod", "dev"))
                .isInstanceOf(ImageStorageBoundaryException.class);
        assertThatThrownBy(() -> ImageStorageScope.from(properties, "prod", "local"))
                .isInstanceOf(ImageStorageBoundaryException.class);
        ImageProperties cleanup = new ImageProperties(
                "techcourse-project-2026", "ap-northeast-2", "jarihana/images",
                null, null, null, null, null, null, 0, null, true, null, null, 0, 0);
        assertThatThrownBy(() -> ImageStorageScope.from(cleanup, "local"))
                .isInstanceOf(ImageStorageBoundaryException.class);
    }

    @DisplayName("bucket과 prefix의 공백·누락을 운영 기본값으로 보정하지 않는다.")
    @Test
    void preservesMissingSettingsForValidation() {
        // Given / When
        ImageProperties properties = properties(null, " ");

        // Then
        assertThat(properties.bucket()).isNull();
        assertThat(properties.keyPrefix()).isEqualTo(" ");
    }

    @DisplayName("리전이 다른 설정도 거부한다.")
    @ParameterizedTest
    @ValueSource(strings = {" ", "us-east-1"})
    void rejectsUnexpectedRegion(String region) {
        // Given
        ImageProperties properties = new ImageProperties(
                "techcourse-project-2026", region, "jarihana/images",
                null, null, null, null, null, null, 0, null, false, null, null, 0, 0);

        // When / Then
        assertThatThrownBy(() -> ImageStorageScope.from(properties, "prod"))
                .isInstanceOf(ImageStorageBoundaryException.class);
    }

    private ImageProperties properties(String bucket, String prefix) {
        return new ImageProperties(bucket, "ap-northeast-2", prefix,
                null, null, null, null, null, null, 0, null, false, null, null, 0, 0);
    }
}
