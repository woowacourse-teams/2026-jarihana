package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RoomStateTest {
    @Test
    void reconnectDuringJumpReturnsToTheWalkableFloor() {
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "a", 1000);
        var start = room.participants().getFirst().position();
        room.move("1", "a", 1, Map.of("x", start.x(), "y", start.y() + .5, "z", start.z(), "yaw", 0, "locomotion", "jumping"), 1100);
        room.join(TestRooms.admission("1"), "b", 1200);
        assertThat(room.participants().getFirst().position()).isEqualTo(start);
        assertThat(room.participants().getFirst().locomotion()).isEqualTo("idle");
    }

    @Test
    void newParticipantsSpawnApartAndReconnectKeepsPosition() {
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "a", 1000);
        room.join(TestRooms.admission("2"), "b", 1000);
        var first = room.participants().getFirst().position();
        var second = room.participants().getLast().position();
        assertThat(first.distance(second)).isGreaterThanOrEqualTo(.85);
        room.join(TestRooms.admission("1"), "new", 1100);
        assertThat(room.participants().getFirst().position()).isEqualTo(first);
    }

    @Test
    @DisplayName("같은 좌석에는 한 사람만 앉을 수 있다")
    void onlyOneParticipantOccupiesSeat() {
        // Given
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "connection-a", 1000);
        room.join(TestRooms.admission("2"), "connection-b", 1000);
        // When
        room.command("1", "connection-a", Map.of("action", "SIT", "assetId", "sofa", "slot", 0), 1100);
        // Then
        assertThatThrownBy(() -> room.command("2", "connection-b", Map.of("action", "SIT", "assetId", "sofa", "slot", 0), 1100))
                .isInstanceOf(RuleViolation.class).hasMessageContaining("OCCUPIED");
    }

    @Test
    @DisplayName("교체된 연결의 종료가 새 참여자를 제거하지 않는다")
    void staleDisconnectDoesNotRemoveReplacement() {
        // Given
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "old", 1000);
        room.join(TestRooms.admission("1"), "new", 1100);
        // When
        room.leave("1", "old", 1200);
        // Then
        assertThat(room.participants()).hasSize(1);
        assertThat(room.participants().getFirst().connectionGeneration()).isEqualTo("new");
    }

    @Test
    @DisplayName("소파 이동과 삭제는 점유를 해제하고 새 위치를 동기화한다")
    void layoutChangeReleasesMovedSeat() {
        // Given
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "a", 1000);
        room.command("1", "a", Map.of("action", "SIT", "assetId", "sofa", "slot", 0), 1100);
        // When
        room.replaceLayout(TestRooms.layout(2, 4), 1200);
        // Then
        assertThat(room.participants().getFirst().seat()).isNull();
        assertThat(room.layoutRevision()).isEqualTo(2);
    }
}
