package com.project.jarihana.notificationdelivery.support;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
@TestConfiguration(proxyBeanMethods = false)
public class PushTransportTestConfig {
    @Bean @Primary
    public PushTransportStub pushTransportStub() { return new PushTransportStub(); }
}
