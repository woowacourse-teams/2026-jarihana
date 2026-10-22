package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@Import(PushTransportTestConfig.class)
@TestPropertySource(properties = {"jarihana.push.worker-enabled=true", "jarihana.push.poll-delay=50"})
class PushScheduledDeliveryTest extends PushIntegrationTestSupport {
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushTransportStub transport;
    @Autowired private PushDeliveryWorker worker;

    @AfterEach
    void stopWorker() {
        worker.close();
    }

    @Test
    @DisplayName("실제 스케줄러가 전송을 시작하고 비동기 응답 뒤 DB에 수락 결과를 저장한다.")
    void scheduledTickSendsAndAcknowledgesWithoutManualWorkerCall() {
        // Given
        transport.reset();
        var response = new CompletableFuture<PushResult>();
        transport.respondAsync(request -> response);
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "scheduled"),
                subscription(owner, "one"), NOW, NOW.plusDays(1)));
        // When
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(transport.requests()).hasSize(1));
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.IN_FLIGHT);
        response.complete(PushResult.accepted());
        awaitDeliveryProcessing();
        // Then
        var accepted = deliveries.findById(pending.getId()).orElseThrow();
        assertThat(accepted.getStatus()).isEqualTo(DeliveryStatus.ACCEPTED);
        assertThat(accepted.getAttemptCount()).isEqualTo(1);
        assertThat(accepted.getLeaseToken()).isNull();
        assertThat(transport.requests()).hasSize(1);
    }
}
