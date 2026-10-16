package com.project.jarihana.image.client;

import java.time.Duration;

public interface ImageStorage {

    String issueUploadUrl(String imageKey, String contentType, Duration expiration);

    boolean exists(String imageKey);

    ImageObjectMetadata metadata(String imageKey);

    void copy(String sourceImageKey, String targetImageKey);

    void delete(String imageKey);
}
