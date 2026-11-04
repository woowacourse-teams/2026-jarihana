package com.project.jarihana.common.config;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@Configuration(proxyBeanMethods = false)
public class SseMetricsConfig implements WebMvcConfigurer {
    private final SseMetricsInterceptor interceptor;

    public SseMetricsConfig(MeterRegistry metrics) {
        interceptor = new SseMetricsInterceptor(metrics);
    }

    @Bean
    SmartInitializingSingleton initializeSseMetrics(
            @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping handlerMapping) {
        return () -> handlerMapping.getHandlerMethods().keySet().stream()
                .filter(mapping -> mapping.getProducesCondition().getProducibleMediaTypes().stream()
                        .anyMatch(MediaType.TEXT_EVENT_STREAM::equalsTypeAndSubtype))
                .flatMap(mapping -> mapping.getPatternValues().stream())
                .distinct()
                .forEach(interceptor::initializeMetrics);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor);
    }
}
