package com.project.jarihana.share.query.service;

import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.share.query.service.dto.SharePreviewResult;
import com.project.jarihana.sparring.query.service.SparringQueryService;
import com.project.jarihana.sparring.query.service.dto.SparringShareResult;
import java.net.URI;
import org.springframework.stereotype.Service;

@Service
public class SparringSharePreviewService {

    private static final String DEFAULT_IMAGE_PATH = "/sparring-arena/assets/entry-rivals.webp";

    private final SparringQueryService sparringQueryService;
    private final String frontendOrigin;

    public SparringSharePreviewService(SparringQueryService sparringQueryService, AuthProperties authProperties) {
        this.sparringQueryService = sparringQueryService;
        this.frontendOrigin = authProperties.frontendOrigin();
    }

    public SharePreviewResult findSparringPreview(long topicId) {
        SparringShareResult topic = sparringQueryService.shareTopic(topicId);
        String canonicalUrl = frontendOrigin + "/sparring/" + topicId;
        return new SharePreviewResult(
                topic.title() + " | 토론해요 · 자리하나",
                topic.a() + " vs " + topic.b(),
                canonicalUrl,
                toAbsoluteUrl(topic.representativeImageUrl()),
                canonicalUrl + "?preview=1",
                "토론 페이지로 이동"
        );
    }

    private String toAbsoluteUrl(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return frontendOrigin + DEFAULT_IMAGE_PATH;
        }
        if (URI.create(imageUrl).isAbsolute()) {
            return imageUrl;
        }
        return frontendOrigin + "/" + imageUrl.replaceFirst("^/+", "");
    }
}
