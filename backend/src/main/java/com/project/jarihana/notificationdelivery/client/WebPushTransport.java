package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Future;

@Component
public class WebPushTransport implements PushTransport, AutoCloseable {
    @FunctionalInterface
    interface AddressResolver { InetAddress[] resolve(String host) throws UnknownHostException; }
    @FunctionalInterface
    interface HttpSender {
        PushHttpResponse send(HttpRequest request, InetAddress[] addresses) throws IOException, InterruptedException;
    }

    private final PushProperties properties;
    private final PushEndpointPolicy endpoints;
    private final Clock clock;
    private final HttpSender client;
    private final AddressResolver resolver;
    private final VAPIDKeyPair keys;
    private final ExecutorService dnsLookups = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS,
            new SynchronousQueue<>(), Thread.ofPlatform().daemon(true).name("push-dns-", 0).factory(),
            new ThreadPoolExecutor.AbortPolicy());

    @Autowired
    public WebPushTransport(PushProperties properties, PushEndpointPolicy endpoints, Clock clock) {
        this(properties, endpoints, clock, new PinnedPushHttpSender(properties), InetAddress::getAllByName);
    }

    WebPushTransport(PushProperties properties, PushEndpointPolicy endpoints, Clock clock,
                     HttpClient client, AddressResolver resolver) {
        this(properties, endpoints, clock, (request, addresses) -> {
            var response = client.send(request, HttpResponse.BodyHandlers.discarding());
            return new PushHttpResponse(response.statusCode(), response.headers().firstValue("Retry-After").orElse(null));
        }, resolver);
    }

    WebPushTransport(PushProperties properties, PushEndpointPolicy endpoints, Clock clock,
                     HttpSender client, AddressResolver resolver) {
        this.properties = properties;
        this.endpoints = endpoints;
        this.clock = clock;
        this.client = client;
        this.resolver = resolver;
        this.keys = properties.enabled() ? loadKeys(properties) : null;
    }

    @Override
    public PushResult send(PushRequest request) {
        if (!properties.enabled()) return result(PushResult.Outcome.FAILED, "PUSH_DISABLED", null);
        try {
            URI endpoint = endpoints.validate(request.endpoint());
            InetAddress[] addresses = resolve(endpoint.getHost());
            if (addresses.length == 0) return result(PushResult.Outcome.FAILED, "UNSAFE_ADDRESS", null);
            for (InetAddress address : addresses) {
                if (!isPublic(address)) return result(PushResult.Outcome.FAILED, "UNSAFE_ADDRESS", null);
            }
            long ttl = Duration.between(LocalDateTime.now(clock), request.expiresAt()).getSeconds();
            if (ttl <= 0) return result(PushResult.Outcome.FAILED, "EXPIRED", null);
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
            PushHttpResponse response = client.send(httpRequest, addresses);
            int status = response.status();
            if (status >= 200 && status < 300) return PushResult.accepted();
            if (status == 404 || status == 410) return result(PushResult.Outcome.GONE, "HTTP_" + status, null);
            if (status == 429 || status >= 500) {
                return result(PushResult.Outcome.RETRY, "HTTP_" + status,
                        retryAfter(response.retryAfter()));
            }
            return result(PushResult.Outcome.FAILED, "HTTP_" + status, null);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return result(PushResult.Outcome.RETRY, "INTERRUPTED", null);
        } catch (IOException exception) {
            return result(PushResult.Outcome.RETRY, "NETWORK_ERROR", null);
        } catch (RuntimeException exception) {
            return result(PushResult.Outcome.FAILED, "INVALID_REQUEST", null);
        }
    }

    private InetAddress[] resolve(String host) throws IOException, InterruptedException {
        var lookup = submitLookup(host);
        try { return lookup.get(properties.connectTimeout().toMillis(), TimeUnit.MILLISECONDS); }
        catch (ExecutionException | TimeoutException exception) { throw new IOException("푸시 서비스 주소를 확인하지 못했습니다."); }
        finally { lookup.cancel(true); }
    }

    private Future<InetAddress[]> submitLookup(String host) throws IOException {
        try { return dnsLookups.submit(() -> resolver.resolve(host)); }
        catch (RejectedExecutionException exception) { throw new IOException("푸시 서비스 주소 조회가 사용 중입니다."); }
    }

    @PreDestroy
    @Override
    public void close() {
        dnsLookups.shutdownNow();
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
