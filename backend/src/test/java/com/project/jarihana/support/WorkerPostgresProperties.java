package com.project.jarihana.support;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.PropertySource;

public final class WorkerPostgresProperties implements ApplicationContextInitializer<ConfigurableApplicationContext> {
    @Override
    public void initialize(ConfigurableApplicationContext context) {
        var environment = context.getEnvironment();
        if (environment.containsProperty("spring.datasource.url")) {
            return;
        }
        environment.getPropertySources().addLast(new PropertySource<>("workerPostgres") {
            @Override
            public Object getProperty(String name) {
                return switch (name) {
                    case "spring.datasource.url" -> WorkerPostgres.container().getJdbcUrl();
                    case "spring.datasource.username" -> WorkerPostgres.container().getUsername();
                    case "spring.datasource.password" -> WorkerPostgres.container().getPassword();
                    default -> null;
                };
            }
        });
    }
}
