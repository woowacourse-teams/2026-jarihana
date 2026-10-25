package com.project.jarihana.image.command.service;

import com.project.jarihana.image.client.ImageKeyPolicy;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ImageMarkdown {

    private static final Pattern IMAGE_KEY = Pattern.compile(
            "groups/(?:tmp|[1-9][0-9]*)/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\\.(?:jpg|png|webp)"
    );

    private ImageMarkdown() {
    }

    public static Set<String> imageKeys(String markdown) {
        Set<String> keys = new LinkedHashSet<>();
        if (markdown == null || markdown.isBlank()) {
            return keys;
        }
        Matcher matcher = IMAGE_KEY.matcher(markdown);
        while (matcher.find()) {
            String key = matcher.group();
            if (ImageKeyPolicy.isManaged(key)) {
                keys.add(key);
            }
        }
        return keys;
    }

    public static String replaceKeys(String markdown, Function<String, String> replacement) {
        if (markdown == null || markdown.isBlank()) {
            return markdown;
        }
        Matcher matcher = IMAGE_KEY.matcher(markdown);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement.apply(matcher.group())));
        }
        matcher.appendTail(result);
        return result.toString();
    }
}
