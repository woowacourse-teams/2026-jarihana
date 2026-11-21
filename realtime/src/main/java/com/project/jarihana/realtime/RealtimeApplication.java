package com.project.jarihana.realtime;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.room.persistence.RoomReadRepository;
import java.util.Arrays;

@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
@EnableConfigurationProperties(RealtimeProperties.class)
public class RealtimeApplication {
    public static void main(String[] args) {
        if (Arrays.asList(args).contains("--check-runtime")) {
            try (var context = SpringApplication.run(RealtimeApplication.class, args)) {
                if (!context.getBean(RealtimeProperties.class).enabled()) {
                    throw new IllegalStateException("Runtime preflight requires both enabled database connections");
                }
                context.getBean(RoomReadRepository.class).verifyRuntimeMigration();
            }
            return;
        }
        SpringApplication.run(RealtimeApplication.class, args);
    }
}
