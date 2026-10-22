package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.notificationdelivery.client.dto.PushHttpResponse;
import com.project.jarihana.notificationdelivery.config.PushDeliveryProperties;
import com.project.jarihana.pushsubscription.config.PushProperties;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Flow;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.async.methods.SimpleHttpRequest;
import org.apache.hc.client5.http.async.methods.SimpleRequestProducer;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.config.TlsConfig;
import org.apache.hc.client5.http.impl.async.CloseableHttpAsyncClient;
import org.apache.hc.client5.http.impl.async.HttpAsyncClients;
import org.apache.hc.client5.http.impl.nio.PoolingAsyncClientConnectionManagerBuilder;
import org.apache.hc.core5.concurrent.FutureCallback;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.HttpHost;
import org.apache.hc.core5.http.HttpResponse;
import org.apache.hc.core5.http.nio.entity.DiscardingEntityConsumer;
import org.apache.hc.core5.http.nio.support.AbstractAsyncResponseConsumer;
import org.apache.hc.core5.http.protocol.HttpContext;
import org.apache.hc.core5.io.CloseMode;
import org.apache.hc.core5.pool.PoolConcurrencyPolicy;
import org.apache.hc.core5.reactor.IOReactorConfig;
import org.apache.hc.core5.util.TimeValue;
import org.apache.hc.core5.util.Timeout;

final class PinnedPushHttpSender implements WebPushTransport.HttpSender, AutoCloseable {
    private final PushProperties properties;
    private final CloseableHttpAsyncClient client;
    private final Set<CompletableFuture<PushHttpResponse>> active = ConcurrentHashMap.newKeySet();
    private final ScheduledThreadPoolExecutor deadlines = new ScheduledThreadPoolExecutor(1,
            Thread.ofPlatform().daemon(true).name("push-http-deadline").factory());

    PinnedPushHttpSender(PushProperties properties) {
        this(properties, PushDeliveryProperties.defaults());
    }

    PinnedPushHttpSender(PushProperties properties, PushDeliveryProperties delivery) {
        this.properties = properties;
        deadlines.setRemoveOnCancelPolicy(true);
        var timeout = Timeout.ofMilliseconds(properties.requestTimeout().toMillis());
        var connectTimeout = Timeout.ofMilliseconds(properties.connectTimeout().toMillis());
        var connections = PoolingAsyncClientConnectionManagerBuilder.create()
                .setDnsResolver(rejectUnpinnedResolution())
                .setPoolConcurrencyPolicy(PoolConcurrencyPolicy.STRICT)
                .setMaxConnPerRoute(delivery.maxConnectionsPerRoute())
                .setMaxConnTotal(delivery.maxConnections())
                .setDefaultConnectionConfig(ConnectionConfig.custom().setConnectTimeout(connectTimeout)
                        .setSocketTimeout(timeout)
                        .setTimeToLive(TimeValue.ofMilliseconds(delivery.connectionTimeToLive().toMillis())).build())
                .setDefaultTlsConfig(TlsConfig.custom().setHandshakeTimeout(connectTimeout).build()).build();
        client = HttpAsyncClients.custom().setConnectionManager(connections)
                .setIOReactorConfig(IOReactorConfig.custom().setIoThreadCount(delivery.ioThreads()).build())
                .disableRedirectHandling().disableAutomaticRetries().disableCookieManagement()
                .setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(timeout)
                        .setConnectionRequestTimeout(Timeout.ofMilliseconds(delivery.poolWaitTimeout().toMillis())).build())
                .evictExpiredConnections()
                .evictIdleConnections(TimeValue.ofMilliseconds(delivery.idleTimeout().toMillis()))
                .build();
        client.start();
    }

    @Override
    public CompletableFuture<PushHttpResponse> send(HttpRequest prepared, InetAddress[] addresses) {
        var result = new CompletableFuture<PushHttpResponse>();
        var exchange = new AtomicReference<Future<PushHttpResponse>>();
        active.add(result);
        result.whenComplete((response, error) -> {
            active.remove(result);
            if (error != null) {
                Future<PushHttpResponse> running = exchange.get();
                if (running != null) running.cancel(true);
            }
        });
        try {
            var deadline = deadlines.schedule(
                    () -> result.completeExceptionally(new IOException("푸시 요청 제한 시간을 초과했습니다.")),
                    properties.requestTimeout().toMillis(), TimeUnit.MILLISECONDS);
            result.whenComplete((response, error) -> deadline.cancel(false));
            body(prepared).whenComplete((bytes, error) -> {
                if (error != null) {
                    result.completeExceptionally(error);
                    return;
                }
                if (result.isDone()) return;
                try {
                    var uri = prepared.uri();
                    int port = uri.getPort() == -1 ? ("https".equals(uri.getScheme()) ? 443 : 80) : uri.getPort();
                    var target = new HttpHost(uri.getScheme(), addresses[0], uri.getHost(), port);
                    var post = SimpleHttpRequest.create("POST", uri);
                    post.setBody(bytes, ContentType.APPLICATION_OCTET_STREAM);
                    prepared.headers().map().forEach((name, values) ->
                            values.forEach(value -> post.addHeader(name, value)));
                    var running = client.execute(target, SimpleRequestProducer.create(post), responseConsumer(),
                            null, null, new FutureCallback<PushHttpResponse>() {
                                @Override public void completed(PushHttpResponse response) { result.complete(response); }
                                @Override public void failed(Exception cause) { result.completeExceptionally(cause); }
                                @Override public void cancelled() {
                                    result.completeExceptionally(new IOException("푸시 요청이 취소되었습니다."));
                                }
                            });
                    exchange.set(running);
                    if (result.isCompletedExceptionally()) running.cancel(true);
                } catch (RuntimeException exception) {
                    result.completeExceptionally(exception);
                }
            });
        } catch (RuntimeException exception) {
            result.completeExceptionally(exception);
        }
        return result;
    }

    @Override
    public void close() {
        active.forEach(request -> request.cancel(true));
        deadlines.shutdownNow();
        client.close(CloseMode.GRACEFUL);
    }

    private static DnsResolver rejectUnpinnedResolution() {
        return new DnsResolver() {
            @Override public InetAddress[] resolve(String host) throws UnknownHostException {
                throw new UnknownHostException("검증한 푸시 주소가 필요합니다.");
            }
            @Override public String resolveCanonicalHostname(String host) throws UnknownHostException {
                throw new UnknownHostException("검증한 푸시 주소가 필요합니다.");
            }
        };
    }

    private static AbstractAsyncResponseConsumer<PushHttpResponse, Void> responseConsumer() {
        return new AbstractAsyncResponseConsumer<>(new DiscardingEntityConsumer<Void>()) {
            @Override protected PushHttpResponse buildResult(HttpResponse response, Void entity, ContentType contentType) {
                var retryAfter = response.getFirstHeader("Retry-After");
                return new PushHttpResponse(response.getCode(), retryAfter == null ? null : retryAfter.getValue());
            }
            @Override public void informationResponse(HttpResponse response, HttpContext context) {
            }
        };
    }

    private static CompletableFuture<byte[]> body(HttpRequest prepared) {
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
        return result;
    }
}
