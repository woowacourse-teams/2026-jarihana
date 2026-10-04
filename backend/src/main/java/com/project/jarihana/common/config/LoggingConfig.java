package com.project.jarihana.common.config;

import com.project.jarihana.common.logging.BusinessOperationLoggingInterceptor;
import com.project.jarihana.common.logging.ControllerInputLoggingInterceptor;
import com.project.jarihana.common.logging.ExternalAdapterLoggingInterceptor;
import com.project.jarihana.common.logging.HttpRequestLoggingFilter;
import java.lang.reflect.Method;
import org.springframework.aop.Advisor;
import org.springframework.aop.support.DefaultPointcutAdvisor;
import org.springframework.aop.support.StaticMethodMatcherPointcut;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Role;
import org.springframework.core.Ordered;

@Configuration(proxyBeanMethods = false)
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class LoggingConfig {
    @Bean
    public FilterRegistrationBean<HttpRequestLoggingFilter> httpRequestLoggingFilter() {
        FilterRegistrationBean<HttpRequestLoggingFilter> registration = new FilterRegistrationBean<>(new HttpRequestLoggingFilter());
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return registration;
    }

    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public Advisor businessLoggingAdvisor() {
        DefaultPointcutAdvisor advisor = new DefaultPointcutAdvisor(new StaticMethodMatcherPointcut() {
            @Override
            public boolean matches(Method method, Class<?> targetClass) {
                return BusinessOperationLoggingInterceptor.matches(method, targetClass);
            }
        }, new BusinessOperationLoggingInterceptor());
        // Wrap Spring's default transaction advisor so an owned commit must succeed first.
        advisor.setOrder(Ordered.LOWEST_PRECEDENCE - 100);
        return advisor;
    }

    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public Advisor externalAdapterLoggingAdvisor() {
        return new DefaultPointcutAdvisor(new StaticMethodMatcherPointcut() {
            @Override
            public boolean matches(Method method, Class<?> targetClass) {
                return ExternalAdapterLoggingInterceptor.matches(method, targetClass);
            }
        }, new ExternalAdapterLoggingInterceptor());
    }

    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public Advisor controllerInputLoggingAdvisor() {
        return new DefaultPointcutAdvisor(new StaticMethodMatcherPointcut() {
            @Override
            public boolean matches(Method method, Class<?> targetClass) {
                String name = targetClass.getName();
                return name.startsWith("com.project.jarihana.") && name.endsWith("Controller")
                        && (name.contains(".command.controller.") || name.contains(".query.controller."));
            }
        }, new ControllerInputLoggingInterceptor());
    }
}
