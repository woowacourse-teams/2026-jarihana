package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.config.PushDeliveryProperties;
import com.project.jarihana.pushsubscription.config.PushProperties;
import com.project.jarihana.pushsubscription.domain.PushEndpointPolicy;
import org.springframework.stereotype.Component;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.time.Clock;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.IOException;
import java.math.BigInteger;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPrivateKeySpec;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.concurrent.TimeUnit;
import com.zerodeplibs.webpush.PushSubscription;
import com.zerodeplibs.webpush.VAPIDKeyPair;
import com.zerodeplibs.webpush.VAPIDKeyPairs;
import com.zerodeplibs.webpush.key.PrivateKeySources;
import com.zerodeplibs.webpush.key.PublicKeySources;
import com.zerodeplibs.webpush.httpclient.StandardHttpClientRequestPreparer;
import org.springframework.beans.factory.annotation.Autowired;
import com.project.jarihana.notificationdelivery.client.dto.PushHttpResponse;
import jakarta.annotation.PreDestroy;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.FutureTask;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.RejectedExecutionException;

@Component
public class WebPushTransport implements PushTransport, AutoCloseable {
    @FunctionalInterface
    interface AddressResolver { InetAddress[] resolve(String host) throws UnknownHostException; }
    @FunctionalInterface
    interface HttpSender {
        CompletableFuture<PushHttpResponse> send(HttpRequest request, InetAddress[] addresses);
    }

    private final PushProperties properties;
    private final PushEndpointPolicy endpoints;
    private final Clock clock;
    private final HttpSender client;
    private final AddressResolver resolver;
    private final VAPIDKeyPair keys;
    private final ThreadPoolExecutor preparation;
    private final Set<CompletableFuture<PushResult>> active = ConcurrentHashMap.newKeySet();
    private final ScheduledThreadPoolExecutor deadlines = new ScheduledThreadPoolExecutor(1,
            Thread.ofPlatform().daemon(true).name("push-prepare-deadline").factory());

    @Autowired
    public WebPushTransport(PushProperties properties, PushDeliveryProperties delivery,
                            PushEndpointPolicy endpoints, Clock clock) {
        this(properties, delivery, endpoints, clock, null, InetAddress::getAllByName);
    }

    WebPushTransport(PushProperties properties, PushEndpointPolicy endpoints, Clock clock,
                     HttpClient client, AddressResolver resolver) {
        this(properties, PushDeliveryProperties.defaults(), endpoints, clock,
                (request, addresses) -> client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                        .thenApply(response -> new PushHttpResponse(response.statusCode(),
                                response.headers().firstValue("Retry-After").orElse(null))), resolver);
    }

    WebPushTransport(PushProperties properties, PushEndpointPolicy endpoints, Clock clock,
                     HttpSender client, AddressResolver resolver) {
        this(properties, PushDeliveryProperties.defaults(), endpoints, clock, client, resolver);
    }

    WebPushTransport(PushProperties properties, PushDeliveryProperties delivery, PushEndpointPolicy endpoints, Clock clock,
                     HttpSender client, AddressResolver resolver) {
        this.properties = properties;
        this.endpoints = endpoints;
        this.clock = clock;
        this.resolver = resolver;
        this.keys = properties.enabled() ? loadKeys(properties) : null;
        this.client = client == null && properties.enabled() ? new PinnedPushHttpSender(properties, delivery) : client;
        this.preparation = new ThreadPoolExecutor(delivery.dnsThreads(), delivery.dnsThreads(), 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(delivery.dnsQueueCapacity()),
                Thread.ofPlatform().daemon(true).name("push-prepare-", 0).factory(),
                new ThreadPoolExecutor.AbortPolicy());
        deadlines.setRemoveOnCancelPolicy(true);
    }

    @Override
    public CompletableFuture<PushResult> send(PushRequest request) {
        if (!properties.enabled()) {
            return CompletableFuture.completedFuture(result(PushResult.Outcome.FAILED, "PUSH_DISABLED", null));
        }
        var result = new CompletableFuture<PushResult>();
        var exchange = new AtomicReference<CompletableFuture<PushHttpResponse>>();
        var dnsComplete = new CompletableFuture<Void>();
        var task = new FutureTask<Void>(() -> {
            prepareAndSend(request, result, exchange, dnsComplete);
            return null;
        });
        active.add(result);
        result.whenComplete((response, error) -> {
            active.remove(result);
            task.cancel(true);
            preparation.remove(task);
            var running = exchange.get();
            if (running != null && !running.isDone()) running.cancel(true);
        });
        try {
            var dnsDeadline = deadlines.schedule(() -> {
                if (!dnsComplete.isDone()) result.complete(result(PushResult.Outcome.RETRY, "NETWORK_ERROR", null));
            }, properties.connectTimeout().toMillis(), TimeUnit.MILLISECONDS);
            var requestDeadline = deadlines.schedule(
                    () -> result.complete(result(PushResult.Outcome.RETRY, "NETWORK_ERROR", null)),
                    properties.requestTimeout().toMillis(), TimeUnit.MILLISECONDS);
            dnsComplete.whenComplete((unused, error) -> dnsDeadline.cancel(false));
            result.whenComplete((response, error) -> {
                dnsDeadline.cancel(false);
                requestDeadline.cancel(false);
            });
            preparation.execute(task);
        } catch (RejectedExecutionException exception) {
            result.complete(result(PushResult.Outcome.RETRY, "NETWORK_ERROR", null));
        }
        return result;
    }

    private void prepareAndSend(PushRequest request, CompletableFuture<PushResult> completion,
                                AtomicReference<CompletableFuture<PushHttpResponse>> exchange,
                                CompletableFuture<Void> dnsComplete) {
        if (completion.isDone()) return;
        try {
            URI endpoint = endpoints.validate(request.endpoint());
            InetAddress[] addresses = resolver.resolve(endpoint.getHost());
            dnsComplete.complete(null);
            if (completion.isDone()) return;
            if (addresses.length == 0) {
                completion.complete(result(PushResult.Outcome.FAILED, "UNSAFE_ADDRESS", null));
                return;
            }
            for (InetAddress address : addresses) {
                if (!isPublic(address)) {
                    completion.complete(result(PushResult.Outcome.FAILED, "UNSAFE_ADDRESS", null));
                    return;
                }
            }
            long ttl = Duration.between(LocalDateTime.now(clock), request.expiresAt()).getSeconds();
            if (ttl <= 0) {
                completion.complete(result(PushResult.Outcome.FAILED, "EXPIRED", null));
                return;
            }
            var subscription = new PushSubscription();
            subscription.setEndpoint(request.endpoint());
            var subscriptionKeys = new PushSubscription.Keys();
            subscriptionKeys.setP256dh(request.p256dh());
            subscriptionKeys.setAuth(request.auth());
            subscription.setKeys(subscriptionKeys);
            String payload = "{\"notificationId\":" + request.notificationId() + ",\"subscriptionId\":"
                    + request.subscriptionId() + ",\"generation\":" + request.generation()
                    + ",\"payloadVersion\":" + request.payloadVersion() + "}";
            HttpRequest httpRequest = StandardHttpClientRequestPreparer.getBuilder().pushSubscription(subscription)
                    .vapidJWTExpirationTime(clock.instant().plusSeconds(900)).vapidJWTSubject(properties.vapidSubject())
                    .pushMessage(payload).ttl((int) Math.min(ttl, Integer.MAX_VALUE), TimeUnit.SECONDS)
                    .build(keys).toRequestBuilder().timeout(properties.requestTimeout()).build();
            if (completion.isDone()) return;
            var running = client.send(httpRequest, addresses);
            exchange.set(running);
            if (completion.isDone()) running.cancel(true);
            running.whenComplete((response, error) -> completion.complete(error == null
                    ? classify(response) : result(PushResult.Outcome.RETRY, "NETWORK_ERROR", null)));
        } catch (IOException exception) {
            completion.complete(result(PushResult.Outcome.RETRY, "NETWORK_ERROR", null));
        } catch (RuntimeException exception) {
            completion.complete(result(PushResult.Outcome.FAILED, "INVALID_REQUEST", null));
        }
    }

    private PushResult classify(PushHttpResponse response) {
        int status = response.status();
        if (status >= 200 && status < 300) return PushResult.accepted();
        if (status == 404 || status == 410) return result(PushResult.Outcome.GONE, "HTTP_" + status, null);
        if (status == 429 || status >= 500) {
            return result(PushResult.Outcome.RETRY, "HTTP_" + status, retryAfter(response.retryAfter()));
        }
        return result(PushResult.Outcome.FAILED, "HTTP_" + status, null);
    }

    @PreDestroy
    @Override
    public void close() {
        active.forEach(request -> request.complete(result(PushResult.Outcome.RETRY, "NETWORK_ERROR", null)));
        preparation.shutdownNow();
        deadlines.shutdownNow();
        if (client instanceof PinnedPushHttpSender sender) sender.close();
    }

    private Duration retryAfter(String value) {
        if (value == null) return null;
        try {
            long seconds;
            try { seconds = Long.parseLong(value); }
            catch (NumberFormatException exception) {
                seconds = Duration.between(clock.instant(), ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).getSeconds();
            }
            return Duration.ofSeconds(Math.max(0, seconds));
        } catch (RuntimeException exception) { return null; }
    }

    private static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] bytes = address.getAddress();
        if (bytes.length == 4) {
            int first = bytes[0] & 255;
            int second = bytes[1] & 255;
            int third = bytes[2] & 255;
            return first != 0 && first < 224 && !(first == 100 && second >= 64 && second <= 127)
                    && !(first == 192 && second == 0 && (third == 0 || third == 2))
                    && !(first == 198 && (second == 18 || second == 19 || second == 51 && third == 100))
                    && !(first == 203 && second == 0 && third == 113);
        }
        return (bytes[0] & 224) == 32 && !((bytes[0] & 255) == 32 && (bytes[1] & 255) == 1
                && (bytes[2] & 255) == 13 && (bytes[3] & 255) == 184);
    }

    private static VAPIDKeyPair loadKeys(PushProperties properties) {
        try {
            URI subject = URI.create(properties.vapidSubject());
            if (!("mailto".equals(subject.getScheme()) && subject.getSchemeSpecificPart().contains("@"))
                    && !("https".equals(subject.getScheme()) && subject.getHost() != null)) throw new IllegalArgumentException();
            byte[] scalar = Base64.getUrlDecoder().decode(properties.vapidPrivateKey());
            if (scalar.length != 32) throw new IllegalArgumentException();
            AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
            parameters.init(new ECGenParameterSpec("secp256r1"));
            ECParameterSpec curve = parameters.getParameterSpec(ECParameterSpec.class);
            BigInteger number = new BigInteger(1, scalar);
            if (number.signum() == 0 || number.compareTo(curve.getOrder()) >= 0) throw new IllegalArgumentException();
            ECPrivateKey privateKey = (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(number, curve));
            var publicSource = PublicKeySources.ofUncompressedBytes(Base64.getUrlDecoder().decode(properties.vapidPublicKey()));
            Signature proof = Signature.getInstance("SHA256withECDSA");
            proof.initSign(privateKey);
            proof.update(new byte[]{1});
            byte[] signature = proof.sign();
            proof.initVerify(publicSource.extract());
            proof.update(new byte[]{1});
            if (!proof.verify(signature)) throw new IllegalArgumentException();
            return VAPIDKeyPairs.of(PrivateKeySources.ofECPrivateKey(privateKey), publicSource);
        } catch (Exception exception) {
            throw new IllegalArgumentException("VAPID 키 쌍 또는 연락처 설정이 유효하지 않습니다.");
        }
    }

    private static PushResult result(PushResult.Outcome outcome, String code, Duration retryAfter) {
        return new PushResult(outcome, code, retryAfter);
    }
}
