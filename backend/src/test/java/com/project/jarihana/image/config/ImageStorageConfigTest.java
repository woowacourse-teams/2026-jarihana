package com.project.jarihana.image.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.image.client.ImageStorageBoundaryException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ImageStorageConfigTest {

    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(ImageStorageConfig.class)
            .withInitializer(application -> application.getEnvironment().setActiveProfiles("dev"))
            .withPropertyValues("jarihana.image.bucket=techcourse-project-2026",
                    "jarihana.image.region=ap-northeast-2");

    @DisplayName("dev의 정상 S3 설정은 서버 시작 시 검증을 통과한다.")
    @Test
    void startsWithValidDevelopmentScope() {
        context.withPropertyValues("jarihana.image.key-prefix=jarihana-dev/images")
                .run(application -> assertThat(application).hasNotFailed());
    }

    @DisplayName("dev의 운영 prefix는 정리 작업이 꺼져 있어도 서버 시작을 거부한다.")
    @Test
    void failsStartupWithProductionPrefixEvenWhenCleanupDisabled() {
        context.withPropertyValues("jarihana.image.key-prefix=jarihana/images", "jarihana.image.cleanup-enabled=false")
                .run(application -> assertThat(application).hasFailed()
                        .getFailure().hasRootCauseInstanceOf(ImageStorageBoundaryException.class));
    }

    @DisplayName("prefix 미설정은 기본 경로로 보정하지 않고 서버 시작을 거부한다.")
    @Test
    void failsStartupWithMissingPrefix() {
        context.run(application -> assertThat(application).hasFailed()
                .getFailure().hasRootCauseInstanceOf(ImageStorageBoundaryException.class));
    }
}
