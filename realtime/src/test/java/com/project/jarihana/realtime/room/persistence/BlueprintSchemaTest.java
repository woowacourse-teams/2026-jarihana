package com.project.jarihana.realtime.room.persistence;

import static com.project.jarihana.realtime.config.RealtimeEnvironment.DEV;
import static com.project.jarihana.realtime.config.RealtimeEnvironment.PROD;
import static com.project.jarihana.realtime.room.persistence.BlueprintSchema.Source.BUNDLED;
import static com.project.jarihana.realtime.room.persistence.BlueprintSchema.Source.DATABASE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;

class BlueprintSchemaTest {
    private final JdbcClient dev = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
    private final JdbcClient prod = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
    private final RealtimeDatabases databases = mock(RealtimeDatabases.class);
    private final BlueprintSchema schema = new BlueprintSchema(databases);

    BlueprintSchemaTest() {
        when(databases.client(DEV)).thenReturn(dev);
        when(databases.client(PROD)).thenReturn(prod);
    }

    @Test
    void aFailedInitialProbeCannotSelectBundledEvenAfterRestart() {
        when(dev.sql(contains("to_regclass")).query(Boolean.class).single())
                .thenThrow(new DataAccessResourceFailureException("database offline"));
        assertThatThrownBy(() -> schema.source(DEV)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> new BlueprintSchema(databases).source(DEV)).isInstanceOf(DataAccessException.class);
    }

    @Test
    void observedDatabaseSchemaRequiresReadableMarkerAndCatalogEvenAfterAnOutage() {
        when(dev.sql(contains("to_regclass")).query(Boolean.class).single()).thenReturn(false, true, false);
        when(dev.sql(contains("FROM space_blueprint_migration")).query(Boolean.class).single())
                .thenReturn(false, true, true, false, true);
        when(dev.sql(contains("WITH templates")).query(Boolean.class).single()).thenReturn(false, true);
        assertThat(schema.source(DEV)).isEqualTo(BUNDLED);
        assertThatThrownBy(() -> schema.verify(DEV, false)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> schema.source(DEV)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> schema.verify(DEV, false)).isInstanceOf(DataAccessException.class);
        assertThat(schema.verify(DEV, false)).isEqualTo(DATABASE);
        assertThatThrownBy(() -> schema.verify(DEV, false)).isInstanceOf(DataAccessException.class);
        assertThat(schema.verify(DEV, false)).isEqualTo(DATABASE);
    }

    @Test
    void waitingForOneEnvironmentDoesNotBlockTheOther() throws Exception {
        var reading = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(dev.sql(contains("to_regclass")).query(Boolean.class).single()).thenAnswer(call -> {
            reading.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("blocked probe");
            return false;
        });
        when(prod.sql(contains("to_regclass")).query(Boolean.class).single()).thenReturn(false);
        try (var threads = Executors.newFixedThreadPool(2)) {
            var first = threads.submit(() -> schema.source(DEV));
            try {
                assertThat(reading.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(threads.submit(() -> schema.source(PROD)).get(3, TimeUnit.SECONDS)).isEqualTo(BUNDLED);
            } finally {
                release.countDown();
            }
            assertThat(first.get(5, TimeUnit.SECONDS)).isEqualTo(BUNDLED);
        }
    }
}
