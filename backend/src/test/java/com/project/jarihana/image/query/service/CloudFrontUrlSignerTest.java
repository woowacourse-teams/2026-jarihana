package com.project.jarihana.image.query.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.image.config.ImageProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CloudFrontUrlSignerTest {

    @DisplayName("CloudFront canned policy 서명 URL에 만료 시각과 키 식별자를 포함한다.")
    @Test
    void signsCannedPolicyUrl() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair keyPair = generator.generateKeyPair();
        String privateKey = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----";
        CloudFrontUrlSigner signer = new CloudFrontUrlSigner(properties("KTEST123", privateKey));
        String resourceUrl = "https://service.example.test/images/groups/12/photo.webp";
        Instant expiresAt = Instant.parse("2026-10-14T00:05:00Z");

        String signedUrl = signer.sign(resourceUrl, expiresAt);

        Map<String, String> query = query(signedUrl);
        assertThat(signedUrl).startsWith(resourceUrl + "?");
        assertThat(query.get("Expires")).isEqualTo("1791936300");
        assertThat(query.get("Key-Pair-Id")).isEqualTo("KTEST123");
        String policy = "{\"Statement\":[{\"Resource\":\"" + resourceUrl
                + "\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":1791936300}}}]}";
        Signature verifier = Signature.getInstance("SHA1withRSA");
        verifier.initVerify(keyPair.getPublic());
        verifier.update(policy.getBytes(StandardCharsets.UTF_8));
        assertThat(verifier.verify(fromCloudFrontBase64(query.get("Signature")))).isTrue();
    }

    @DisplayName("서명 키를 설정하지 않은 로컬 환경에서는 전달 URL을 그대로 사용한다.")
    @Test
    void leavesUrlUnsignedWithoutKeyConfiguration() {
        CloudFrontUrlSigner signer = new CloudFrontUrlSigner(properties("", ""));
        String resourceUrl = "https://service.example.test/images/groups/12/photo.webp";

        assertThat(signer.sign(resourceUrl, Instant.parse("2026-10-14T00:05:00Z")))
                .isEqualTo(resourceUrl);
    }

    private ImageProperties properties(String keyPairId, String privateKey) {
        return new ImageProperties(
                "bucket",
                "ap-northeast-2",
                "jarihana/images",
                "https://service.example.test/api/images",
                "https://service.example.test/images",
                keyPairId,
                privateKey,
                null,
                null,
                0,
                null,
                false,
                null,
                null,
                0,
                0
        );
    }

    private Map<String, String> query(String signedUrl) {
        return Stream.of(signedUrl.substring(signedUrl.indexOf('?') + 1).split("&"))
                .map(parameter -> parameter.split("=", 2))
                .collect(Collectors.toMap(parts -> parts[0], parts -> parts[1]));
    }

    private byte[] fromCloudFrontBase64(String value) {
        return Base64.getDecoder().decode(value
                .replace('-', '+')
                .replace('_', '=')
                .replace('~', '/'));
    }
}
