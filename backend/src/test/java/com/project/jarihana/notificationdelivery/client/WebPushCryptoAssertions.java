package com.project.jarihana.notificationdelivery.client;

import com.zerodeplibs.webpush.key.PublicKeySources;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPrivateKeySpec;
import java.util.Arrays;
import java.util.Base64;
import static org.assertj.core.api.Assertions.assertThat;

final class WebPushCryptoAssertions {
    private WebPushCryptoAssertions() { }

    static String decrypt(byte[] encoded, String browserPublicKey) throws Exception {
        var parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        var privateKey = KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(BigInteger.ONE,
                parameters.getParameterSpec(ECParameterSpec.class)));
        var buffer = ByteBuffer.wrap(encoded);
        byte[] salt = new byte[16];
        buffer.get(salt);
        int recordSize = buffer.getInt();
        int keyLength = buffer.get() & 255;
        assertThat(keyLength).isEqualTo(65);
        byte[] sender = new byte[keyLength];
        buffer.get(sender);
        byte[] encrypted = new byte[buffer.remaining()];
        assertThat(recordSize).isGreaterThanOrEqualTo(encrypted.length);
        buffer.get(encrypted);
        var agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(privateKey);
        agreement.doPhase(PublicKeySources.ofUncompressedBytes(sender).extract(), true);
        byte[] info = concat("WebPush: info\0".getBytes(StandardCharsets.UTF_8), Base64.getUrlDecoder().decode(browserPublicKey), sender, new byte[]{1});
        byte[] ikm = hmac(hmac(new byte[16], agreement.generateSecret()), info);
        byte[] prk = hmac(salt, ikm);
        byte[] key = Arrays.copyOf(hmac(prk, "Content-Encoding: aes128gcm\0\1".getBytes(StandardCharsets.UTF_8)), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk, "Content-Encoding: nonce\0\1".getBytes(StandardCharsets.UTF_8)), 12);
        var cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        byte[] plaintext = cipher.doFinal(encrypted);
        int delimiter = plaintext.length - 1;
        while (plaintext[delimiter] == 0) delimiter--;
        assertThat(plaintext[delimiter]).isEqualTo((byte) 2);
        return new String(plaintext, 0, delimiter, StandardCharsets.UTF_8);
    }

    static String verifyVapid(String authorization, String publicKey) throws Exception {
        String jwt = authorization.substring("vapid t=".length()).split(",", 2)[0];
        String[] parts = jwt.split("\\.");
        var signature = Signature.getInstance("SHA256withECDSAinP1363Format");
        signature.initVerify(PublicKeySources.ofUncompressedBytes(Base64.getUrlDecoder().decode(publicKey)).extract());
        signature.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(signature.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();
        return new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
    }

    private static byte[] hmac(byte[] key, byte[] message) throws Exception {
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(message);
    }

    private static byte[] concat(byte[]... arrays) {
        int size = Arrays.stream(arrays).mapToInt(array -> array.length).sum();
        ByteBuffer buffer = ByteBuffer.allocate(size);
        for (byte[] array : arrays) buffer.put(array);
        return buffer.array();
    }
}
