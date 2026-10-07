package com.project.jarihana.pushsubscription;

import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import static org.assertj.core.api.Assertions.assertThat;

@TestPropertySource(properties = "jarihana.push.enabled=false")
class PushDisabledAcceptanceTest extends PushIntegrationTestSupport {
    @Test
    void disabledFeatureReportsNoKeyAndRejectsNewRegistrationButAllowsDisconnection() {
        // Given
        var owner = member("101");
        var request = body(owner, "one");
        var subscription = subscriptions.findByEndpoint((String) request.get("endpoint")).orElseThrow();
        // When
        var config = authenticated(owner).get("/push-config");
        var registered = mutation(owner).contentType("application/json").body(request).post("/push-subscriptions");
        var disabled = mutation(owner).delete("/push-subscriptions/" + subscription.getId());
        // Then
        assertThat(config.statusCode()).isEqualTo(200);
        assertThat(config.jsonPath().getBoolean("data.enabled")).isFalse();
        assertThat(config.jsonPath().getString("data.vapidPublicKey")).isNull();
        assertThat(registered.statusCode()).isEqualTo(503);
        assertThat(registered.jsonPath().getString("error.code")).isEqualTo("PUSH_UNAVAILABLE");
        assertThat(disabled.statusCode()).isEqualTo(204);
    }
}
