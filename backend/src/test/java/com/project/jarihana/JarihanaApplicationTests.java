package com.project.jarihana;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// 앱 시작 시 모든 JPA 저장소를 생성해 JPQL 오류를 검출한다.
@SpringBootTest(properties = "spring.data.jpa.repositories.bootstrap-mode=default")
class JarihanaApplicationTests {

    @Test
    void contextLoads() {
    }

}
