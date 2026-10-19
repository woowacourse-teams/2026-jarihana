package com.project.jarihana.image.query.service;

import com.project.jarihana.image.config.ImageProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import org.springframework.stereotype.Component;

@Component
public class CloudFrontUrlSigner {

    private final ImageProperties properties;

    public CloudFrontUrlSigner(ImageProperties properties) {
        this.properties = properties;
    }

    public String sign(String resourceUrl, Instant expiresAt) {
        if (properties.cloudFrontKeyPairId().isBlank() || properties.cloudFrontPrivateKey().isBlank()) {
            return resourceUrl;
        }
        long epochSeconds = expiresAt.getEpochSecond();
        String policy = "{\"Statement\":[{\"Resource\":\"" + escape(resourceUrl)
                + "\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":" + epochSeconds + "}}}]}";
        try {
            Signature signer = Signature.getInstance("SHA1withRSA");
            signer.initSign(privateKey());
            signer.update(policy.getBytes(StandardCharsets.UTF_8));
            String signature = cloudFrontBase64(signer.sign());
            String separator = resourceUrl.contains("?") ? "&" : "?";
            return resourceUrl + separator
                    + "Expires=" + epochSeconds
                    + "&Signature=" + signature
                    + "&Key-Pair-Id=" + properties.cloudFrontKeyPairId();
        } catch (Exception exception) {
            throw new IllegalStateException("CloudFront 이미지 URL에 서명할 수 없습니다.", exception);
        }
    }

    private PrivateKey privateKey() throws Exception {
        String pem = properties.cloudFrontPrivateKey()
                .replace("\\n", "\n")
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        byte[] encoded = Base64.getDecoder().decode(pem);
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(encoded));
    }

    private static String cloudFrontBase64(byte[] value) {
        return Base64.getEncoder().encodeToString(value)
                .replace('+', '-')
                .replace('=', '_')
                .replace('/', '~');
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
