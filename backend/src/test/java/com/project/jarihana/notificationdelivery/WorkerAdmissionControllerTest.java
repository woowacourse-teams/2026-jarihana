package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.config.PushWorkerControlProperties;
import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class WorkerAdmissionControllerTest {
    @Test
    @DisplayName("완료 확인 없이 허가를 반환하면 중단이나 재개로 불명확한 결과를 지울 수 없다.")
    void unresolvedPermitBlocksResumeEvenAfterPause() {
        // Given
        var admission = new WorkerAdmissionController(new PushWorkerControlProperties(false));
        var permit = admission.tryAcquire().orElseThrow();

        // When
        permit.close();
        admission.pause();

        // Then
        assertThatIllegalStateException().isThrownBy(admission::resume);
        assertThat(admission.tryAcquire()).isEmpty();
        assertThat(admission.drainStatus()).isEqualTo(new WorkerAdmissionController.DrainStatus(
                WorkerAdmissionController.State.BLOCKED, 0, 1));
        assertThat(admission.drainStatus().isDrained()).isFalse();
    }

    @Test
    @DisplayName("시작 대기는 새 프로세스마다 적용하고 실행 중 재개할 수 있다.")
    void newProcessStartsPausedEvenAfterPreviousProcessResumed() {
        // Given
        var properties = new PushWorkerControlProperties(true);
        var admission = new WorkerAdmissionController(properties);
        assertThat(admission.tryAcquire()).isEmpty();

        // When
        admission.resume();

        // Then
        try (var permit = admission.tryAcquire().orElseThrow()) {
            assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.ACTIVE);
            permit.complete();
        }
        assertThat(new WorkerAdmissionController(properties).tryAcquire()).isEmpty();
    }

    @Test
    @DisplayName("기존 설정의 기본값은 작업 처리를 허용한다.")
    void defaultConfigurationStartsActive() {
        // Given
        var admission = new WorkerAdmissionController(new PushWorkerControlProperties(false));

        // When
        try (var permit = admission.tryAcquire().orElseThrow()) {
            // Then
            assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.ACTIVE);
            permit.complete();
        }
    }

    @Test
    @DisplayName("중단 이후에는 새 허가를 내주지 않고 모든 기존 허가가 반환될 때까지 재개를 거부한다.")
    void pauseWaitsForAllPermitsAndRejectsResume() {
        // Given
        var admission = new WorkerAdmissionController(new PushWorkerControlProperties(false));
        var first = admission.tryAcquire().orElseThrow();
        var second = admission.tryAcquire().orElseThrow();

        // When
        admission.pause();
        first.complete();
        first.close();
        first.close();
        admission.pause();

        // Then
        assertThat(admission.tryAcquire()).isEmpty();
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.DRAINING);
        assertThatIllegalStateException().isThrownBy(admission::resume);
        assertThat(admission.drainStatus().inFlight()).isEqualTo(1);
        assertThat(admission.drainStatus().isDrained()).isFalse();
        second.complete();
        second.close();
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
        assertThat(admission.drainStatus().isDrained()).isTrue();
        admission.resume();
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.ACTIVE);
        assertThat(admission.drainStatus().isDrained()).isFalse();
    }

    @Test
    @DisplayName("다른 작업의 정상 완료나 중복 반환으로 불명확한 작업을 완료 처리하지 않는다.")
    void completedPermitCannotClearAnotherUnresolvedPermit() {
        // Given
        var admission = new WorkerAdmissionController(new PushWorkerControlProperties(false));
        var unknown = admission.tryAcquire().orElseThrow();
        var completed = admission.tryAcquire().orElseThrow();
        admission.pause();

        // When
        unknown.close();
        unknown.close();
        completed.complete();
        completed.close();

        // Then
        assertThat(admission.drainStatus()).isEqualTo(new WorkerAdmissionController.DrainStatus(
                WorkerAdmissionController.State.BLOCKED, 0, 1));
        assertThatIllegalStateException().isThrownBy(unknown::complete);
        assertThat(admission.drainStatus().isDrained()).isFalse();
    }
}
