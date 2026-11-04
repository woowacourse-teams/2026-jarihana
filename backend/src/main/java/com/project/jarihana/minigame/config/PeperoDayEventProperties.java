package com.project.jarihana.minigame.config;

import com.project.jarihana.minigame.domain.EventSchedule;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.LocalDateTime;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 빼빼로데이 반 나누기 이벤트의 기간, 끝난 뒤 게임방으로 옮기는 시각과 하루 도전 횟수다. 시각은 서비스 시간대(Asia/Seoul) 기준이다.
 *
 * <p>{@code alwaysOpen}은 local과 dev 프로필에서 기간과 관계없이 이벤트를 열어 두려고 둔다.
 */
@Validated
@ConfigurationProperties(prefix = "jarihana.minigame.pepero-day")
public record PeperoDayEventProperties(
        @NotNull
        LocalDateTime opensAt,

        @NotNull
        LocalDateTime closesAt,

        @NotNull
        LocalDateTime gameRoomOpensAt,

        boolean alwaysOpen,

        @Positive
        int dailyAttemptLimit
) {

    public EventSchedule schedule() {
        return EventSchedule.of(opensAt, closesAt, gameRoomOpensAt, alwaysOpen);
    }
}
