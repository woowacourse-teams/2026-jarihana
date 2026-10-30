package com.project.jarihana.image.client;

import java.util.regex.Pattern;

public final class ImageKeyPolicy {

    public static final String DEFAULT_IMAGE_KEY = "images/default-group.png";

    private static final Pattern MANAGED_KEY = Pattern.compile(
            "(?:groups/(?:tmp|[1-9][0-9]*)|sparrings/[1-9][0-9]*)/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\\.(?:jpg|png|webp)"
    );

    private ImageKeyPolicy() {
    }

    public static boolean isManaged(String imageKey) {
        return imageKey != null && MANAGED_KEY.matcher(imageKey).matches();
    }

    public static boolean isTemporary(String imageKey) {
        return isManaged(imageKey) && imageKey.startsWith("groups/tmp/");
    }

    public static String finalKey(long groupId, String temporaryKey) {
        if (groupId < 1 || !isTemporary(temporaryKey)) {
            throw new IllegalArgumentException("그룹 이미지 키가 올바르지 않습니다.");
        }
        return "groups/" + groupId + "/" + temporaryKey.substring("groups/tmp/".length());
    }

    public static String sparringKey(long topicId, String temporaryKey) {
        if (topicId < 1 || !isTemporary(temporaryKey)) {
            throw new IllegalArgumentException("토론 이미지 키가 올바르지 않습니다.");
        }
        return "sparrings/" + topicId + "/" + temporaryKey.substring("groups/tmp/".length());
    }
}
