package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.notificationdelivery.client.dto.PushHttpResponse;
import com.project.jarihana.pushsubscription.config.PushProperties;
import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.config.TlsConfig;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.ByteArrayEntity;
import org.apache.hc.core5.util.Timeout;
import lombok.RequiredArgsConstructor;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@RequiredArgsConstructor
final class PinnedPushHttpSender implements WebPushTransport.HttpSender, AutoCloseable {
    private final PushProperties properties;
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("push-http-deadline").factory());

    @Override
    public PushHttpResponse send(HttpRequest prepared, InetAddress[] addresses) throws IOException, InterruptedException {
        var timeout = Timeout.ofMilliseconds(properties.requestTimeout().toMillis());
        var connectTimeout = Timeout.ofMilliseconds(properties.connectTimeout().toMillis());
        var connections = PoolingHttpClientConnectionManagerBuilder.create()
                .setDnsResolver(pinnedResolver(prepared.uri().getHost(), addresses[0]))
                .setDefaultConnectionConfig(ConnectionConfig.custom().setConnectTimeout(connectTimeout).setSocketTimeout(timeout).build())
                .setDefaultTlsConfig(TlsConfig.custom().setHandshakeTimeout(connectTimeout).build()).build();
        var post = new HttpPost(prepared.uri());
        post.setEntity(new ByteArrayEntity(body(prepared), ContentType.APPLICATION_OCTET_STREAM));
        prepared.headers().map().forEach((name, values) -> values.forEach(value -> post.addHeader(name, value)));
        var deadline = deadlines.schedule(post::cancel, properties.requestTimeout().toMillis(), TimeUnit.MILLISECONDS);
        try (var client = HttpClients.custom().setConnectionManager(connections).disableRedirectHandling()
                .disableAutomaticRetries().disableCookieManagement().disableContentCompression()
                .setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(timeout)
                        .setConnectionRequestTimeout(connectTimeout).build()).build()) {
            try (var response = client.executeOpen(null, post, null)) {
                var retryAfter = response.getFirstHeader("Retry-After");
                var result = new PushHttpResponse(response.getCode(), retryAfter == null ? null : retryAfter.getValue());
                post.cancel();
                return result;
            }
        } finally {
            deadline.cancel(false);
            post.cancel();
        }
    }

    @Override
    public void close() { deadlines.shutdownNow(); }

    static DnsResolver pinnedResolver(String expectedHost, InetAddress address) {
        return new DnsResolver() {
            @Override
            public InetAddress[] resolve(String host) throws UnknownHostException {
                if (!expectedHost.equalsIgnoreCase(host)) throw new UnknownHostException("허용된 푸시 호스트와 일치하지 않습니다.");
                return new InetAddress[]{address};
            }

            @Override
            public String resolveCanonicalHostname(String host) throws UnknownHostException {
                resolve(host);
                return expectedHost;
            }
        };
    }

    private static byte[] body(HttpRequest prepared) throws IOException, InterruptedException {
        var result = new CompletableFuture<byte[]>();
        prepared.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            @Override public void onSubscribe(Flow.Subscription subscription) { subscription.request(Long.MAX_VALUE); }
            @Override public void onNext(ByteBuffer item) {
                byte[] chunk = new byte[item.remaining()];
                item.get(chunk);
                bytes.writeBytes(chunk);
            }
            @Override public void onError(Throwable error) { result.completeExceptionally(error); }
            @Override public void onComplete() { result.complete(bytes.toByteArray()); }
        });
        try { return result.get(); }
        catch (ExecutionException exception) { throw new IOException("푸시 요청 본문을 준비하지 못했습니다."); }
    }
}
