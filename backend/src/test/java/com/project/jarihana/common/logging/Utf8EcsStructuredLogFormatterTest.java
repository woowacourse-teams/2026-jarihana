package com.project.jarihana.common.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.MarkerFactory;
import org.slf4j.event.KeyValuePair;
import org.springframework.boot.json.JsonWriter;
import org.springframework.boot.logging.logback.StructuredLogEncoder;
import org.springframework.boot.logging.structured.StructuredLoggingJsonMembersCustomizer;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class Utf8EcsStructuredLogFormatterTest {

    private static final String FORMATTER = "com.project.jarihana.common.logging.Utf8EcsStructuredLogFormatter";

    private final LoggerContext context = new LoggerContext();
    private final List<StructuredLogEncoder> encoders = new ArrayList<>();

    @AfterEach
    void tearDown() {
        encoders.forEach(StructuredLogEncoder::stop);
        context.stop();
    }

    @DisplayName("BMP UTF-8과 다른 인코딩은 Boot ECS 바이트를 보존한다.")
    @ParameterizedTest(name = "{0}")
    @MethodSource("messagesAndCharsets")
    void preservesBootEcsBytes(String scenario, String message, Charset charset) {
        // Given
        context.putObject(Environment.class.getName(), new MockEnvironment());
        StructuredLogEncoder baseline = encoder("ecs", charset);
        StructuredLogEncoder candidate = encoder(FORMATTER, charset);
        LoggingEvent event = event(message);
        byte[] expected = baseline.encode(event);

        // When
        byte[] actual = candidate.encode(event);

        // Then
        assertThat(actual).as(scenario).isNotEmpty().isEqualTo(expected);
    }

    static Stream<Arguments> messagesAndCharsets() {
        return Stream.of(
                Arguments.of("ASCII", "request completed", StandardCharsets.UTF_8),
                Arguments.of("Korean BMP", "모임 조회가 완료됐습니다", StandardCharsets.UTF_8),
                Arguments.of("escaping", "quote \" slash \\ newline\n tab\t control\u0001", StandardCharsets.UTF_8),
                Arguments.of("UTF16", "모임 😀 완료", StandardCharsets.UTF_16),
                Arguments.of("Latin1", "café 모임", StandardCharsets.ISO_8859_1),
                Arguments.of("stateful charset", "日本語 완료", Charset.forName("ISO-2022-JP"))
        );
    }

    @DisplayName("서비스 정보와 JSON 사용자 설정 및 예외 출력을 보존한다.")
    @Test
    void preservesCustomJsonSettingsAndThrowable() {
        // Given
        MockEnvironment environment = new MockEnvironment()
                .withProperty("spring.application.pid", "123")
                .withProperty("logging.structured.ecs.service.name", "formatter-test")
                .withProperty("logging.structured.ecs.service.version", "test-version")
                .withProperty("logging.structured.json.rename.message", "description")
                .withProperty("logging.structured.json.add.fixture", "custom-value")
                .withProperty("logging.structured.json.exclude", "log.level")
                .withProperty("logging.structured.json.stacktrace.max-length", "256");
        context.putObject(Environment.class.getName(), environment);
        StructuredLogEncoder baseline = encoder("ecs", StandardCharsets.UTF_8);
        StructuredLogEncoder candidate = encoder(FORMATTER, StandardCharsets.UTF_8);
        LoggingEvent event = event("customized event");
        byte[] expected = baseline.encode(event);

        // When
        byte[] actual = candidate.encode(event);

        // Then
        assertThat(actual).isEqualTo(expected);
        assertThat(new String(actual, StandardCharsets.UTF_8))
                .contains("formatter-test", "test-version", "custom-value", "\"description\"", "stack_trace")
                .doesNotContain("\"level\"");
    }

    @DisplayName("보충 Unicode 문자를 메시지와 문맥 및 예외에 원문 그대로 기록한다.")
    @Test
    void preservesSupplementaryCharactersInContextAndException() {
        // Given
        context.putObject(Environment.class.getName(), new MockEnvironment());
        StructuredLogEncoder candidate = encoder(FORMATTER, StandardCharsets.UTF_8);
        LoggingEvent event = new LoggingEvent(getClass().getName(), context.getLogger("unicode"),
                Level.ERROR, "모임 😀 완료", new IllegalStateException("예외 😀"), null);
        event.setMDCPropertyMap(Map.of("context.value", "값 😀"));
        event.addKeyValuePair(new KeyValuePair("result", "완료 😀"));

        // When
        byte[] actual = candidate.encode(event);

        // Then
        JsonNode json = JsonMapper.builder().build().readTree(actual);
        assertThat(json.path("message").asString()).isEqualTo("모임 😀 완료");
        assertThat(json.at("/context/value").asString()).isEqualTo("값 😀");
        assertThat(json.path("result").asString()).isEqualTo("완료 😀");
        assertThat(json.at("/error/message").asString()).isEqualTo("예외 😀");
        assertThat(json.at("/error/stack_trace").asString()).contains("예외 😀");
    }

    @DisplayName("보충 문자가 있어도 JSON customizer의 이벤트 값은 한 번만 평가한다.")
    @Test
    void evaluatesCustomJsonValueOnceForSupplementaryCharacters() {
        // Given
        context.putObject(Environment.class.getName(), new MockEnvironment()
                .withProperty("logging.structured.json.customizer", CountingJsonCustomizer.class.getName()));
        StructuredLogEncoder candidate = encoder(FORMATTER, StandardCharsets.UTF_8);
        LoggingEvent event = event("supplementary 😀");

        // When
        byte[] actual = candidate.encode(event);

        // Then
        JsonNode json = JsonMapper.builder().build().readTree(actual);
        assertThat(json.path("sequence").asInt()).isEqualTo(1);
        assertThat(json.path("message").asString()).isEqualTo("supplementary 😀");
    }

    @DisplayName("짝이 없는 surrogate는 대체 문자로 기록해 유효한 JSON을 유지한다.")
    @ParameterizedTest
    @MethodSource("malformedSurrogates")
    void replacesMalformedSurrogates(String message) {
        // Given
        context.putObject(Environment.class.getName(), new MockEnvironment());
        StructuredLogEncoder candidate = encoder(FORMATTER, StandardCharsets.UTF_8);

        // When
        byte[] actual = candidate.encode(event(message));

        // Then
        JsonNode json = JsonMapper.builder().build().readTree(actual);
        assertThat(json.path("message").asString()).isEqualTo("malformed ? end");
    }

    static Stream<String> malformedSurrogates() {
        return Stream.of("malformed \uD83D end", "malformed \uDE00 end");
    }

    public static final class CountingJsonCustomizer implements StructuredLoggingJsonMembersCustomizer<LoggingEvent> {

        private final AtomicInteger sequence = new AtomicInteger();

        @Override
        public void customize(JsonWriter.Members<LoggingEvent> members) {
            members.add("sequence", event -> sequence.incrementAndGet());
        }
    }

    private StructuredLogEncoder encoder(String format, Charset charset) {
        StructuredLogEncoder encoder = new StructuredLogEncoder();
        encoder.setContext(context);
        encoder.setFormat(format);
        encoder.setCharset(charset);
        encoders.add(encoder);
        encoder.start();
        return encoder;
    }

    private LoggingEvent event(String message) {
        LoggingEvent event = new LoggingEvent(getClass().getName(), context.getLogger("formatter-test"),
                Level.ERROR, message, new IllegalStateException("테스트 예외", new RuntimeException("cause")), null);
        event.setMDCPropertyMap(Map.of("http.request.id", "request-1", "context.korean", "값"));
        event.addKeyValuePair(new KeyValuePair("result.count", 3));
        event.addKeyValuePair(new KeyValuePair("result.success", true));
        event.addMarker(MarkerFactory.getDetachedMarker("test-marker"));
        return event;
    }
}
