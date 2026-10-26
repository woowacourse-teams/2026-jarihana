package com.project.jarihana.notificationdelivery.command.service;

import com.project.jarihana.notificationdelivery.config.PushWorkerControlProperties;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** 현재 프로세스의 작업 진입만 제어한다. 서버 간 처리 권한을 부여하지 않는다. */
@Component
public class WorkerAdmissionController {
    public enum State { ACTIVE, DRAINING, PAUSED, BLOCKED }

    public record DrainStatus(State state, int inFlight, int unresolved) {
        public boolean isDrained() {
            return state == State.PAUSED && inFlight == 0 && unresolved == 0;
        }
    }

    private State state;
    private final boolean controlled;
    private int admitted;
    private int unresolved;

    public WorkerAdmissionController(PushWorkerControlProperties properties) {
        controlled = properties.workerControlEnabled();
        state = controlled || properties.workerStartPaused() ? State.PAUSED : State.ACTIVE;
    }

    public synchronized Optional<Permit> tryAcquire() {
        if (state != State.ACTIVE) { return Optional.empty(); }
        admitted++;
        return Optional.of(new Permit());
    }

    public synchronized void pause() {
        if (state == State.BLOCKED) { return; }
        state = admitted == 0 ? State.PAUSED : State.DRAINING;
    }

    public synchronized void resume() {
        if (controlled) { throw new IllegalStateException("제어 모드에서는 DB 처리 권한 승인이 필요합니다."); }
        resumeAuthorized();
    }

    synchronized void resumeAuthorized() {
        if (state == State.BLOCKED) {
            throw new IllegalStateException("처리 결과가 불명확하여 worker를 재개할 수 없습니다.");
        }
        if (state == State.DRAINING) {
            throw new IllegalStateException("진행 중인 작업이 끝나기 전에는 worker를 재개할 수 없습니다.");
        }
        state = State.ACTIVE;
    }

    public synchronized State state() {
        return state;
    }

    public synchronized DrainStatus drainStatus() {
        return new DrainStatus(state, admitted, unresolved);
    }

    public final class Permit implements AutoCloseable {
        private boolean closed;
        private boolean completed;

        private Permit() {
        }

        /** DB 트랜잭션까지 정상 반환한 뒤에만 완료를 확인한다. */
        public void complete() {
            synchronized (WorkerAdmissionController.this) {
                if (closed) { throw new IllegalStateException("이미 반환한 처리 허가입니다."); }
                completed = true;
            }
        }

        @Override
        public void close() {
            synchronized (WorkerAdmissionController.this) {
                if (closed) { return; }
                closed = true;
                admitted--;
                if (!completed) {
                    unresolved++;
                    state = State.BLOCKED;
                    return;
                }
                if (state == State.DRAINING && admitted == 0) { state = State.PAUSED; }
            }
        }
    }
}
