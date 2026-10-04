package com.project.jarihana.auth.client;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

public class GithubHttpLoggingInterceptor implements ClientHttpRequestInterceptor {

    private static final Logger log = LoggerFactory.getLogger(GithubHttpLoggingInterceptor.class);

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        long started = System.nanoTime();
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("http.request.method", request.getMethod().name());
        fields.put("url.domain", request.getURI().getHost());
        fields.put("url.path", request.getURI().getPath());
        fields.put("jarihana.provider", "github");
        fields.put("jarihana.duration_scope", "response_headers");
        boolean failed = true;
        try {
            ClientHttpResponse response = execution.execute(request, body);
            int status = response.getStatusCode().value();
            fields.put("http.response.status_code", status);
            failed = status >= 400;
            return response;
        } catch (IOException | RuntimeException exception) {
            fields.put("error.type", exception.getClass().getName());
            throw exception;
        } finally {
            fields.put("event.duration", System.nanoTime() - started);
            record(fields, failed);
        }
    }

    private void record(Map<String, Object> fields, boolean failed) {
        try {
            var event = failed ? log.atWarn() : log.atInfo();
            event.addKeyValue("event.action", "github.http.completed")
                    .addKeyValue("event.category", List.of("network"))
                    .addKeyValue("event.type", List.of("end"))
                    .addKeyValue("event.outcome", failed ? "failure" : "success");
            fields.forEach(event::addKeyValue);
            event.log("GitHub HTTP exchange completed");
        } catch (RuntimeException ignored) {
        }
    }
}
