package com.project.jarihana.rhythmbattle.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;

/**
 * 회원이 지금 참가한 대전 방이다. 한 회원은 한 방에만 앉는다. 들어온 뒤의 채팅부터 볼 수 있도록 입장 시점의
 * 마지막 채팅 번호를 함께 남긴다.
 */
@Getter
@Entity
@Table(name = "rhythm_battle_seat")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmBattleSeat {
    @Id
    @Column(name = "member_id")
    private Long id;

    private long roomId;

    private long chatAfterId;

    private RhythmBattleSeat(long memberId, long roomId, long chatAfterId) {
        this.id = memberId;
        this.roomId = roomId;
        this.chatAfterId = chatAfterId;
    }

    public static RhythmBattleSeat claim(long memberId, long roomId, long chatAfterId) {
        return new RhythmBattleSeat(memberId, roomId, chatAfterId);
    }

    @Override
    public boolean equals(Object value) {
        if (this == value) {
            return true;
        }
        return value instanceof RhythmBattleSeat other && id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}
