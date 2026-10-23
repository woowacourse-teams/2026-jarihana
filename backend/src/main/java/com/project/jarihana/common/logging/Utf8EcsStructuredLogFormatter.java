package com.project.jarihana.common.logging;

import ch.qos.logback.classic.pattern.ThrowableProxyConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import org.springframework.boot.logging.structured.StructuredLogFormatter;
import org.springframework.boot.logging.structured.StructuredLogFormatterFactory;
import org.springframework.core.env.Environment;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

public final class Utf8EcsStructuredLogFormatter implements StructuredLogFormatter<ILoggingEvent> {

    private final StructuredLogFormatter<ILoggingEvent> delegate;

    public Utf8EcsStructuredLogFormatter(Environment environment, ThrowableProxyConverter converter) {
        // Boot exposes no ECS constructor; compatibility tests must guard this internal name on upgrades.
        this.delegate = new StructuredLogFormatterFactory<>(
                ILoggingEvent.class,
                environment,
                parameters -> parameters.add(ThrowableProxyConverter.class, converter),
                formats -> {})
                .get("org.springframework.boot.logging.logback.ElasticCommonSchemaStructuredLogFormatter");
    }

    @Override
    public String format(ILoggingEvent event) {
        return delegate.format(event);
    }

    @Override
    public byte[] formatAsBytes(ILoggingEvent event, Charset charset) {
        if (!StandardCharsets.UTF_8.equals(charset)) {
            return delegate.formatAsBytes(event, charset);
        }
        return delegate.format(event).getBytes(StandardCharsets.UTF_8);
    }
}
