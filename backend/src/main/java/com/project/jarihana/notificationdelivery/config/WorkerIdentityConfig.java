package com.project.jarihana.notificationdelivery.config;

import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.UUID;

@Configuration(proxyBeanMethods = false)
public class WorkerIdentityConfig {
    @Bean
    public WorkerIdentity workerIdentity(PushWorkerControlProperties properties) {
        String hostId = properties.workerHostId().isBlank() ? "uncontrolled" : properties.workerHostId();
        return new WorkerIdentity(hostId, UUID.randomUUID());
    }
}
