package com.project.jarihana.share.query.service;

import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupVisibility;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.service.GroupQueryService;
import com.project.jarihana.group.query.service.dto.GroupDetailResult;
import com.project.jarihana.share.query.service.dto.GroupSharePreview;
import org.springframework.stereotype.Service;

import java.net.URI;

@Service
public class GroupSharePreviewService {

    private static final String SITE_NAME = "자리하나";
    private static final String DEFAULT_IMAGE_PATH = "/assets/default-group.png";

    private static final String HIDDEN_GROUP_DESCRIPTION = "자리하나에서 모임을 확인해 보세요.";

    private final GroupQueryService groupQueryService;
    private final GroupJpaRepository groups;
    private final String frontendOrigin;

    public GroupSharePreviewService(
            GroupQueryService groupQueryService,
            GroupJpaRepository groups,
            AuthProperties authProperties
    ) {
        this.groupQueryService = groupQueryService;
        this.groups = groups;
        this.frontendOrigin = authProperties.frontendOrigin();
    }

    /**
     * CloudFront는 모임 페이지의 모든 첫 요청을 이 미리보기로 보내고, 응답을 공개 캐시에 둔다.
     * 그래서 소속 공개와 비공개 모임은 이름과 소개를 빼고 모임 페이지로 넘긴다.
     * 실제로 볼 수 있는지는 넘어간 화면이 모임 API를 부를 때 다시 판단한다.
     */
    public GroupSharePreview findGroupPreview(long groupId) {
        Group stored = groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        String canonicalUrl = frontendOrigin + "/groups/" + groupId;
        if (stored.getVisibility() != GroupVisibility.PUBLIC) {
            return new GroupSharePreview(
                    SITE_NAME,
                    HIDDEN_GROUP_DESCRIPTION,
                    canonicalUrl,
                    frontendOrigin + DEFAULT_IMAGE_PATH,
                    canonicalUrl + "?preview=1"
            );
        }
        GroupDetailResult result = groupQueryService.findGroup(groupId);
        Group group = result.group();
        return new GroupSharePreview(
                group.getName() + " | " + SITE_NAME,
                group.getIntroduction(),
                canonicalUrl,
                toAbsoluteUrl(result.representativeImageUrl()),
                canonicalUrl + "?preview=1"
        );
    }

    private String toAbsoluteUrl(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank() || "images/default-group.png".equals(imageUrl)) {
            return frontendOrigin + DEFAULT_IMAGE_PATH;
        }
        URI parsed = URI.create(imageUrl);
        if (parsed.isAbsolute()) {
            return imageUrl;
        }
        return frontendOrigin + "/" + imageUrl.replaceFirst("^/+", "");
    }

}
