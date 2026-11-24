package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.ItemState;
import com.project.jarihana.realtime.room.domain.ParticipantState;
import com.project.jarihana.realtime.room.domain.Vec3;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.layout.TestBlueprints;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;

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
    void sittingRetainsThePhysicalApproachForThrowingAndStanding() {
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "a", 1000);
        Vec3 approach = room.participants().getFirst().position();
        var idle = Map.<String, Object>of("x", approach.x(), "y", approach.y(), "z", approach.z(), "yaw", 0, "locomotion", "idle");
        room.command("1", "a", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cookie"), 1100);
        var seat = Map.<String, Object>of("action", "SIT", "assetId", "sofa", "slot", 1);
        assertThatThrownBy(() -> room.command("1", "a", Map.of("action", "SIT", "assetId", "sofa", "slot", 3), 1100))
                .hasMessage("INVALID_SLOT");
        room.command("1", "a", seat, 1100);

        assertThat(room.participants().getFirst().seat()).isEqualTo(new ParticipantState.Seat("sofa", 1));
        assertThat(room.participants().getFirst().position()).isEqualTo(approach);
        assertThat(room.layout().valid(approach, false)).isTrue();
        assertThatThrownBy(() -> room.move("1", "a", 1, idle, 1100)).hasMessage("SEATED");
        room.command("1", "a", Map.of("action", "THROW"), 1200);
        ItemState thrown = room.items().getFirst();
        assertThat(thrown.location()).isEqualTo(ItemState.Location.THROWN);
        assertThat(thrown.position()).isEqualTo(approach.add(new Vec3(0, 0.8, 0)));
        assertThat(thrown.velocity()).isEqualTo(new Vec3(0, 3, -5));

        room.command("1", "a", Map.of("action", "STAND"), 1300);
        assertThat(room.participants().getFirst().seat()).isNull();
        assertThat(room.participants().getFirst().position()).isEqualTo(approach);
        assertThat(room.move("1", "a", 1, idle, 1400)).isTrue();
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
        assertThat(room.layout().valid(room.participants().getFirst().position(), false)).isTrue();
        assertThat(room.layoutRevision()).isEqualTo(2);
    }

    @Test
    void removingSeatReleasesTheOccupantAtTheirSafeApproach() {
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "a", 1000);
        Vec3 approach = room.participants().getFirst().position();
        room.command("1", "a", Map.of("action", "SIT", "assetId", "sofa", "slot", 0), 1100);
        RoomLayout previous = room.layout();
        var assets = new LinkedHashMap<>(previous.assets());
        assets.remove("sofa");
        room.replaceLayout(new RoomLayout(2, previous.catalogGeneration(), assets, previous.geometry(), previous.arrival(), previous.itemRules()), 1200);

        assertThat(room.participants().getFirst().seat()).isNull();
        assertThat(room.participants().getFirst().position()).isEqualTo(approach);
    }

    @Test
    void sameOrOlderLayoutRevisionKeepsTheCurrentLayout() {
        var current = TestRooms.layout(2, 0);
        var room = new RoomState("7", current, 10, 100);

        assertThat(room.replaceLayout(TestRooms.layout(2, 4), 1200)).isFalse();
        assertThat(room.replaceLayout(TestRooms.layout(1, 4), 1300)).isFalse();
        assertThat(room.layout()).isSameAs(current);
    }

    @Test
    void sameLayoutRevisionAppliesSeatRulesWithoutDismountingAnInRangeSeatOnRetirement() {
        RoomState room = TestRooms.room();
        room.join(TestRooms.admission("1"), "a", 1000);
        room.join(TestRooms.admission("2"), "b", 1000);
        Vec3 approach = room.participants().getLast().position();
        room.command("1", "a", Map.of("action", "SIT", "assetId", "sofa", "slot", 0), 1100);
        room.command("2", "b", Map.of("action", "SIT", "assetId", "sofa", "slot", 2), 1100);

        var furniture = TestBlueprints.FURNITURE.deepCopy();
        var sofa = (ObjectNode) furniture.path("sofa");
        sofa.put("placeable", false);
        ((ObjectNode) sofa.path("interaction")).put("seatCount", 1);

        assertThat(room.replaceLayout(TestRooms.layout(1, 0, 2, furniture), 1200)).isTrue();
        assertThat(room.layoutRevision()).isEqualTo(1);
        assertThat(room.snapshot("ROOM_STATE", "2", "b", 1200, true).get("catalogGeneration")).isEqualTo(2L);
        assertThat(room.participants().getFirst().seat()).isEqualTo(new ParticipantState.Seat("sofa", 0));
        assertThat(room.participants().getLast().seat()).isNull();
        assertThat(room.participants().getLast().position()).isEqualTo(approach);
        assertThatThrownBy(() -> room.command("2", "b", Map.of("action", "SIT", "assetId", "sofa", "slot", 2), 1300))
                .hasMessage("INVALID_SLOT");
        assertThat(room.replaceLayout(TestRooms.layout(2, 0), 1300)).isFalse();
        assertThat(room.layout().catalogGeneration()).isEqualTo(2);
    }
}
