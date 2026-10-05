package com.project.jarihana.pushsubscription;

import com.project.jarihana.pushsubscription.config.PushProperties;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushPropertiesTest {
    @Test
    void positiveSubMillisecondTimeoutMustNotDisableNetworkTimeout() {
        // Given / When / Then
        assertThatThrownBy(() -> new PushProperties(false, false, null, null, null, null, null, null,
                Duration.ofNanos(1), Duration.ofNanos(1), null)).isInstanceOf(IllegalArgumentException.class);
    }
}
