package com.project.jarihana.common.config;

import io.micrometer.common.KeyValues;
import io.micrometer.core.instrument.config.MeterFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.observation.DefaultServerRequestObservationConvention;
import org.springframework.http.server.observation.ServerRequestObservationContext;
import org.springframework.http.server.observation.ServerRequestObservationConvention;

@Configuration(proxyBeanMethods = false)
public class HttpRequestMetricsConfig {
    private static final String PROBE_TAG = "deployment.probe";

    @Bean
    public ServerRequestObservationConvention deploymentProbeObservationConvention() {
        return new DefaultServerRequestObservationConvention() {
            @Override
            public KeyValues getLowCardinalityKeyValues(ServerRequestObservationContext context) {
                HttpServletRequest request = context.getCarrier();
                boolean probe = request != null
                        && "true".equals(request.getHeader("X-Jarihana-Deployment-Probe"))
                        && "GET".equals(request.getMethod())
                        && (request.getContextPath() + "/groups").equals(request.getRequestURI())
                        && "1".equals(request.getParameter("size"));
                return super.getLowCardinalityKeyValues(context).and(PROBE_TAG, Boolean.toString(probe));
            }
        };
    }

    @Bean
    public MeterFilter deploymentProbeHttpMetricsFilter() {
        return MeterFilter.deny(id -> "http.server.requests".equals(id.getName())
                && "true".equals(id.getTag(PROBE_TAG)));
    }
}
