package com.project.jarihana;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class JarihanaApplication {

    public static void main(String[] args) {
        SpringApplication.run(JarihanaApplication.class, args);
    }

}
