package com.project.rehearsal;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkerFinishRehearsalTest {
    @Test
    @DisplayName("시험 전용 스키마가 없는 DB에서는 worker 발송 시험을 시작하지 않는다.")
    void rejectSharedDevSchema() {
        // Given
        String url = "jdbc:postgresql://jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com:5432/jarihana_dev?sslmode=require";
        // When / Then
        assertThatThrownBy(() -> WorkerFinishRehearsal.requireIsolatedDatabase(url))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("시험 스키마를 지정해도 운영 DB나 다른 RDS에서는 실행하지 않는다.")
    void rejectProductionAndOtherRds() {
        // Given
        String schema = "&currentSchema=bg_" + "a".repeat(32);
        String dev = "jdbc:postgresql://jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com:5432/jarihana_dev?sslmode=require";
        // When / Then
        assertThatThrownBy(() -> WorkerFinishRehearsal.requireIsolatedDatabase(dev.replace("jarihana_dev", "jarihana_prod") + schema))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> WorkerFinishRehearsal.requireIsolatedDatabase(dev.replace("jarihana-db.", "jarihana-db-temporal.") + schema))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("허용된 개발 DB의 UUID 시험 스키마만 실행 대상으로 인정한다.")
    void acceptOwnedRehearsalSchema() {
        // Given
        String schema = "bg_" + "a".repeat(32);
        String url = "jdbc:postgresql://jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com:5432/jarihana_dev?sslmode=require&currentSchema=" + schema;
        // When / Then
        assertThat(WorkerFinishRehearsal.requireIsolatedDatabase(url)).isEqualTo(schema);
    }
}
