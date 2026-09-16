package com.project.jarihana.share.query.service;

import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.query.service.GroupQueryService;
import com.project.jarihana.group.query.service.dto.GroupDetailResult;
import com.project.jarihana.share.query.service.dto.GroupSharePreview;
import org.springframework.stereotype.Service;

import java.net.URI;

@Service
public class GroupSharePreviewService {

    private static final String SITE_NAME = "자리하나";
    private static final String DEFAULT_IMAGE_PATH = "/images/default-group.png";

    private final GroupQueryService groupQueryService;
    private final String frontendOrigin;

    public GroupSharePreviewService(GroupQueryService groupQueryService, AuthProperties authProperties) {
        this.groupQueryService = groupQueryService;
        this.frontendOrigin = authProperties.frontendOrigin();
    }

    public GroupSharePreview findGroupPreview(long groupId) {
        GroupDetailResult result = groupQueryService.findGroup(groupId);
        Group group = result.group();
        String canonicalUrl = frontendOrigin + "/groups/" + groupId;
        return new GroupSharePreview(
                group.getName() + " | " + SITE_NAME,
                group.getIntroduction(),
                canonicalUrl,
                toAbsoluteUrl(result.representativeImageUrl()),
                canonicalUrl + "?preview=1"
        );
    }

    private String toAbsoluteUrl(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return frontendOrigin + DEFAULT_IMAGE_PATH;
        }
        URI parsed = URI.create(imageUrl);
        if (parsed.isAbsolute()) {
            return imageUrl;
        }
        return frontendOrigin + "/" + imageUrl.replaceFirst("^/+", "");
    }

}
