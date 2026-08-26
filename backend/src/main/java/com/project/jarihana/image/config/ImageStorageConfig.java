package com.project.jarihana.image.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ImageProperties.class)
public class ImageStorageConfig {

    @Bean
    public S3Presigner s3Presigner(ImageProperties properties) {
        return S3Presigner.builder()
                .region(Region.of(properties.region()))
                .build();
    }

    @Bean
    public S3Client s3Client(ImageProperties properties) {
        return S3Client.builder()
                .region(Region.of(properties.region()))
                .build();
    }
}
