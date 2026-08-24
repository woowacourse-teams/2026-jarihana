package com.project.jarihana.support;

import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestSupportConfig.class)
@Sql(scripts = "/sql/truncate.sql", executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
public abstract class IntegrationTestSupport {

    @LocalServerPort
    private int port;

    @Value("${server.servlet.context-path:}")
    private String contextPath;

    /**
     * 요청 경로를 context-path 기준으로 맞춘다.
     *
     * <p>각 테스트는 컨트롤러 매핑 그대로의 경로를 쓰고, 접두사는 여기서 한 번만 붙인다.
     * 설정에서 읽으므로 context-path가 바뀌어도 테스트 본문은 그대로 둔다.
     */
    @BeforeEach
    void setUpRestAssured() {
        RestAssured.port = port;
        RestAssured.basePath = contextPath;
    }
}
