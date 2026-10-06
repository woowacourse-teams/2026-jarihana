package com.project.jarihana.pushsubscription;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.pushsubscription.command.service.PushSubscriptionCommandService;
import com.project.jarihana.pushsubscription.command.service.dto.RegisterPushSubscriptionCommand;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;

class PushRegistrationConcurrencyTest extends PushIntegrationTestSupport {
    @Autowired private PushSubscriptionCommandService bindings;

    @Test
    void concurrentRegistrationForSameOwnerCreatesOneBindingAndPreservesVersion() throws Exception {
        // Given
        var owner = member("101");
        var keys = subscription(owner, "keys");
        var command = new RegisterPushSubscriptionCommand("https://fcm.googleapis.com/concurrent", keys.getP256dh(), keys.getAuth());
        var barrier = new CyclicBarrier(2);
        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { barrier.await(5, TimeUnit.SECONDS); return bindings.registerSubscription(owner.getId(), command); });
            var second = executor.submit(() -> { barrier.await(5, TimeUnit.SECONDS); return bindings.registerSubscription(owner.getId(), command); });
            var one = first.get(10, TimeUnit.SECONDS);
            var two = second.get(10, TimeUnit.SECONDS);
            // Then
            assertThat(one.id()).isEqualTo(two.id());
            assertThat(one.generation()).isEqualTo(1);
            assertThat(two.generation()).isEqualTo(1);
            assertThat(one.created()).isNotEqualTo(two.created());
        }
    }

    @Test
    void concurrentOwnersCannotTakeOverEachOthersEndpoint() throws Exception {
        // Given
        var owner = member("101");
        var other = member("102");
        var keys = subscription(owner, "keys");
        var command = new RegisterPushSubscriptionCommand("https://fcm.googleapis.com/concurrent", keys.getP256dh(), keys.getAuth());
        var barrier = new CyclicBarrier(2);
        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { barrier.await(5, TimeUnit.SECONDS); return register(owner.getId(), command); });
            var second = executor.submit(() -> { barrier.await(5, TimeUnit.SECONDS); return register(other.getId(), command); });
            var one = first.get(10, TimeUnit.SECONDS);
            var two = second.get(10, TimeUnit.SECONDS);
            // Then
            assertThat(one).isNotEqualTo(two);
            assertThat(subscriptions.findByEndpoint(command.endpoint())).isPresent();
            assertThat(jdbc.queryForObject("select count(*) from push_subscriptions where endpoint = ?", Long.class, command.endpoint())).isEqualTo(1);
        }
    }

    private boolean register(long memberId, RegisterPushSubscriptionCommand command) {
        try { bindings.registerSubscription(memberId, command); return true; }
        catch (BusinessException exception) {
            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PUSH_SUBSCRIPTION_CONFLICT);
            return false;
        }
    }
}
