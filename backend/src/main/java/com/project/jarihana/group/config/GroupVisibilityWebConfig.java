package com.project.jarihana.group.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
@RequiredArgsConstructor
public class GroupVisibilityWebConfig implements WebMvcConfigurer {

    private final GroupVisibilityInterceptor groupVisibilityInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(groupVisibilityInterceptor);
    }
}
