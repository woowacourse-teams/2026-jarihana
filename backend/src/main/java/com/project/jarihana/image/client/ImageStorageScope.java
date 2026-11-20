package com.project.jarihana.image.client;

import com.project.jarihana.image.config.ImageProperties;
import java.util.Arrays;
import java.util.List;

/** The shared bucket boundary is fixed in code, never supplied by another environment variable. */
public final class ImageStorageScope {

    private static final String BUCKET = "techcourse-project-2026";
    private static final String REGION = "ap-northeast-2";

    private final ImageProperties properties;
    private final String expectedPrefix;

    private ImageStorageScope(ImageProperties properties, String expectedPrefix) {
        this.properties = properties;
        this.expectedPrefix = expectedPrefix;
    }

    public static ImageStorageScope from(ImageProperties properties, String... activeProfiles) {
        List<String> profiles = Arrays.asList(activeProfiles);
        boolean prod = profiles.contains("prod");
        boolean dev = profiles.contains("dev");
        if ((prod || dev) && profiles.size() != 1) {
            throw new ImageStorageBoundaryException("공유 S3를 사용하는 배포 프로필은 하나만 지정해야 합니다.");
        }
        String prefix = prod ? "jarihana/images" : dev ? "jarihana-dev/images" : null;
        ImageStorageScope scope = new ImageStorageScope(properties, prefix);
        if (prefix != null || properties.cleanupEnabled()) {
            scope.validateConfiguration();
        }
        return scope;
    }

    public String bucket() {
        validateConfiguration();
        return BUCKET;
    }

    public String objectKey(String imageKey) {
        validateConfiguration();
        if (!ImageKeyPolicy.isManaged(imageKey)) {
            throw new ImageStorageBoundaryException("관리 대상이 아닌 이미지 키의 S3 요청을 차단했습니다.");
        }
        String key = properties.keyPrefix() + "/" + imageKey;
        if (!key.startsWith(expectedPrefix + "/")) {
            throw new ImageStorageBoundaryException("허용된 이미지 경로 밖의 S3 요청을 차단했습니다.");
        }
        return key;
    }

    private void validateConfiguration() {
        if (expectedPrefix == null) {
            throw new ImageStorageBoundaryException("dev 또는 prod 배포 프로필에서만 공유 S3 요청을 허용합니다.");
        }
        if (!BUCKET.equals(properties.bucket()) || !REGION.equals(properties.region())
                || !expectedPrefix.equals(properties.keyPrefix())) {
            throw new ImageStorageBoundaryException("이미지 S3 설정이 배포 환경의 허용 범위와 일치하지 않습니다.");
        }
    }
}
