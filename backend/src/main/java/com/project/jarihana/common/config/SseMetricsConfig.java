package com.project.jarihana.common.config;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class SseMetricsConfig implements WebMvcConfigurer {
    private final SseMetricsInterceptor interceptor;

    public SseMetricsConfig(MeterRegistry metrics) {
        interceptor = new SseMetricsInterceptor(metrics);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor);
    }
}
