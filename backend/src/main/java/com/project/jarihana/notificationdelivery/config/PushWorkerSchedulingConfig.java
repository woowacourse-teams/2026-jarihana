package com.project.jarihana.notificationdelivery.config;

import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
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
@ConditionalOnProperty(prefix = "jarihana.push", name = {"enabled", "worker-enabled"}, havingValue = "true")
public class PushWorkerSchedulingConfig {
    private final PushDeliveryWorker worker;

    @Scheduled(fixedDelayString = "${jarihana.push.poll-delay:1000}", initialDelayString = "${jarihana.push.poll-delay:1000}")
    public void dispatchDuePushes() {
        try { worker.processDue(); }
        catch (RuntimeException exception) {
            log.atError().addKeyValue("event.action", "push.worker.failed")
                    .addKeyValue("error.type", exception.getClass().getName()).log("Push worker cycle failed");
        }
    }
}
