-- 반 나누기 게임의 순위 도전 판과 막대별 자른 기록을 저장한다.
-- 새 테이블만 추가하므로 직전 버전 앱은 이 테이블을 읽거나 쓰지 않고 그대로 동작한다.
CREATE TABLE IF NOT EXISTS minigame_run (
    id BIGSERIAL PRIMARY KEY,
    event VARCHAR(40) NOT NULL,
    member_id BIGINT NOT NULL,
    seed BIGINT NOT NULL,
    played_on DATE NOT NULL,
    cut_rounds INTEGER NOT NULL,
    total_score INTEGER NOT NULL,
    total_duration_millis BIGINT NOT NULL,
    round_issued_at TIMESTAMP WITHOUT TIME ZONE,
    finished_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_minigame_run_member FOREIGN KEY (member_id) REFERENCES member (id),
    CONSTRAINT ck_minigame_run_event CHECK (event IN ('PEPERO_DAY_2026', 'STICK_HALVING_ROOM')),
    CONSTRAINT ck_minigame_run_cut_rounds CHECK (cut_rounds BETWEEN 0 AND 5),
    CONSTRAINT ck_minigame_run_total_score CHECK (total_score >= 0),
    CONSTRAINT ck_minigame_run_total_duration CHECK (total_duration_millis >= 0)
);

-- 순위는 끝난 판만 점수, 걸린 시간, 끝낸 시각 순으로 본다.
CREATE INDEX IF NOT EXISTS idx_minigame_run_event_ranking
    ON minigame_run (event, total_score DESC, total_duration_millis, finished_at)
    WHERE finished_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS minigame_cut (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL,
    round_number INTEGER NOT NULL,
    position_cm DOUBLE PRECISION NOT NULL,
    error_rate DOUBLE PRECISION NOT NULL,
    score INTEGER NOT NULL,
    duration_millis BIGINT NOT NULL,
    timed_out BOOLEAN NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uk_minigame_cut_run_round UNIQUE (run_id, round_number),
    CONSTRAINT fk_minigame_cut_run FOREIGN KEY (run_id) REFERENCES minigame_run (id),
    CONSTRAINT ck_minigame_cut_round CHECK (round_number BETWEEN 1 AND 5),
    CONSTRAINT ck_minigame_cut_score CHECK (score BETWEEN 0 AND 1000)
);
