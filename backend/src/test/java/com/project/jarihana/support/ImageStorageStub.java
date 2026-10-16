package com.project.jarihana.support;

import com.project.jarihana.image.client.ImageStorage;
import com.project.jarihana.image.client.ImageObjectMetadata;
import java.time.Duration;
import java.util.HashSet;
import java.util.Set;

public class ImageStorageStub implements ImageStorage {

    private final Set<String> missingImageKeys = new HashSet<>();
    private final Set<String> imageKeys = new HashSet<>();

    @Override
    public boolean exists(String imageKey) {
        return !missingImageKeys.contains(imageKey);
    }

    @Override
    public ImageObjectMetadata metadata(String imageKey) {
        if (missingImageKeys.contains(imageKey)) {
            return null;
        }
        String contentType = imageKey.endsWith(".jpg") ? "image/jpeg"
                : imageKey.endsWith(".png") ? "image/png" : "image/webp";
        return new ImageObjectMetadata(1_024L, contentType);
    }

    @Override
    public void copy(String sourceImageKey, String targetImageKey) {
        if (missingImageKeys.contains(sourceImageKey)) {
            throw new IllegalStateException("source image is missing");
        }
        imageKeys.add(targetImageKey);
    }

    @Override
    public void delete(String imageKey) {
        missingImageKeys.add(imageKey);
        imageKeys.remove(imageKey);
    }

    public void markMissing(String imageKey) {
        missingImageKeys.add(imageKey);
    }

    @Override
    public String issueUploadUrl(String imageKey, String contentType, Duration expiration) {
        return "https://upload.example.test/" + imageKey;
    }
}
