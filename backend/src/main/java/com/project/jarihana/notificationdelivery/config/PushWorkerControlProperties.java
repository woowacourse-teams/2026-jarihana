package com.project.jarihana.notificationdelivery.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "jarihana.push")
public record PushWorkerControlProperties(boolean workerStartPaused, boolean workerControlEnabled,
                                          String workerHostId, String workerEnvironment) {
    @ConstructorBinding
    public PushWorkerControlProperties {
        workerHostId = workerHostId == null ? "" : workerHostId;
        workerEnvironment = workerEnvironment == null ? "" : workerEnvironment;
        if (workerControlEnabled && (!workerHostId.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
                || !workerEnvironment.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,63}"))) {
            throw new IllegalArgumentException("worker 제어 모드에는 환경과 고정 host ID가 필요합니다.");
        }
    }

    public PushWorkerControlProperties(boolean workerStartPaused) {
        this(workerStartPaused, false, "", "");
    }
}
