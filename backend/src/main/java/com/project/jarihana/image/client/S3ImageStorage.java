package com.project.jarihana.image.client;

import com.project.jarihana.image.config.ImageProperties;
import java.time.Duration;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Component
public class S3ImageStorage implements ImageStorage {

    private final S3Presigner s3Presigner;
    private final S3Client s3Client;
    private final ImageProperties properties;

    public S3ImageStorage(S3Presigner s3Presigner, S3Client s3Client, ImageProperties properties) {
        this.s3Presigner = s3Presigner;
        this.s3Client = s3Client;
        this.properties = properties;
    }

    @Override
    public String issueUploadUrl(String imageKey, String contentType, Duration expiration) {
        try {
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(toObjectKey(imageKey))
                    .contentType(contentType)
                    .build();
            PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                    .signatureDuration(expiration)
                    .putObjectRequest(putObjectRequest)
                    .build();
            return s3Presigner.presignPutObject(presignRequest).url().toString();
        } catch (RuntimeException exception) {
            throw new ImageStorageException(exception);
        }
    }

    @Override
    public boolean exists(String imageKey) {
        try {
            s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(toObjectKey(imageKey))
                    .build());
            return true;
        } catch (S3Exception exception) {
            if (exception.statusCode() == 404) {
                return false;
            }
            throw new ImageStorageException(exception);
        } catch (SdkException exception) {
            throw new ImageStorageException(exception);
        }
    }

    private String toObjectKey(String imageKey) {
        String prefix = properties.keyPrefix();
        if (prefix == null || prefix.isBlank()) {
            return imageKey;
        }
        return prefix.replaceAll("/+$", "") + "/" + imageKey;
    }
}
