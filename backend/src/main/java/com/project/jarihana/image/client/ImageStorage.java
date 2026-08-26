package com.project.jarihana.image.client;

import java.time.Duration;

public interface ImageStorage {

    String issueUploadUrl(String imageKey, String contentType, Duration expiration);

    boolean exists(String imageKey);
}
