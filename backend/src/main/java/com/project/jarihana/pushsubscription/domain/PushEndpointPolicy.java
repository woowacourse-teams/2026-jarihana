package com.project.jarihana.pushsubscription.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.pushsubscription.config.PushProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class PushEndpointPolicy {
    private final PushProperties properties;

    public URI validate(String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || (uri.getPort() != -1 && uri.getPort() != 443)
                    || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                    || !properties.allowedHosts().contains(uri.getHost().toLowerCase(Locale.ROOT))) {
                throw invalid();
            }
            return uri;
        } catch (IllegalArgumentException exception) {
            throw invalid();
        }
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "허용된 푸시 서비스의 HTTPS 주소가 필요합니다.");
    }
}
