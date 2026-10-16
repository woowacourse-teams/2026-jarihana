package com.project.jarihana.image.config;

import com.project.jarihana.image.command.service.ImageCleanupService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "jarihana.image", name = "cleanup-enabled", havingValue = "true")
public class ImageCleanupSchedulingConfig {

    private final ImageCleanupService cleanupService;

    @Scheduled(
            fixedDelayString = "${jarihana.image.cleanup-interval-ms:3600000}",
            initialDelayString = "${jarihana.image.cleanup-interval-ms:3600000}"
    )
    public void cleanupImages() {
        try {
            cleanupService.cleanupBatch();
        } catch (RuntimeException exception) {
            log.atError()
                    .addKeyValue("event.action", "image.cleanup.worker_failed")
                    .addKeyValue("error.type", exception.getClass().getName())
                    .log("Image cleanup cycle failed");
        }
    }
}
