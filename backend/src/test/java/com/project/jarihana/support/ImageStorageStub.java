package com.project.jarihana.support;

import com.project.jarihana.image.client.ImageStorage;
import java.time.Duration;
import java.util.HashSet;
import java.util.Set;

public class ImageStorageStub implements ImageStorage {

    private final Set<String> missingImageKeys = new HashSet<>();

    @Override
    public boolean exists(String imageKey) {
        return !missingImageKeys.contains(imageKey);
    }

    public void markMissing(String imageKey) {
        missingImageKeys.add(imageKey);
    }

    @Override
    public String issueUploadUrl(String imageKey, String contentType, Duration expiration) {
        return "https://upload.example.test/" + imageKey;
    }
}
