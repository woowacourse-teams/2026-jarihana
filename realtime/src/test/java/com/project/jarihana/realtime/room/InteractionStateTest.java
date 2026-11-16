package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.realtime.layout.RoomAsset;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.room.domain.ItemState;
import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class InteractionStateTest {
    private RoomState room;

    @BeforeEach
    void join() {
        room = TestRooms.room();
        room.join(TestRooms.admission("1"), "a", 1000);
        room.join(TestRooms.admission("2"), "b", 1000);
    }

    @Test
    void onlyOneParticipantCanPickUpAnInstance() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String id = held();
        command("DROP");
        room.command("2", "b", Map.of("action", "PICKUP", "itemId", id), 1200);
        assertThatThrownBy(() -> command("PICKUP", "itemId", id)).hasMessage("OCCUPIED");
        assertThat(room.item(id).holderId()).isEqualTo("2");
    }

    @Test
    void staleHeldItemCommandDoesNotConsumeReplacement() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String old = held();
        command("DROP");
        command("TAKE", "assetId", "shelf", "kind", "tea");
        String replacement = held();
        assertThatThrownBy(() -> command("CONSUME", "itemId", old)).hasMessage("STALE_ITEM");
        assertThat(room.item(replacement).remaining()).isEqualTo(1);
    }

    @Test
    void catalogConsumptionTurnsDrinkIntoTheSameEmptyCup() {
        command("TAKE", "assetId", "shelf", "kind", "tea");
        String id = held();
        command("CONSUME"); command("CONSUME"); command("CONSUME");
        assertThat(held()).isEqualTo(id);
        assertThat(room.item(id).kind()).isEqualTo("cup");
        assertThat(room.item(id).remaining()).isZero();
        command("RETURN", "assetId", "shelf");
        command("TAKE", "assetId", "shelf", "kind", "cup");
        assertThat(held()).isEqualTo(id);
    }

    @Test
    void surfaceUsesActualHeightIndexAndHasOneOwnerPerShelf() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String id = held();
        command("PLACE", "assetId", "shelf", "slot", 1);
        assertThat(room.item(id).position()).isEqualTo(room.layout().asset("shelf", "surface").surface(1));
        room.command("2", "b", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cookie"), 1200);
        assertThatThrownBy(() -> room.command("2", "b", Map.of("action", "PLACE", "assetId", "shelf", "slot", 1), 1200)).hasMessage("OCCUPIED");
    }

    @Test
    void changedSurfaceMovesItsItemToTheNewAnchor() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String id = held();
        command("PLACE", "assetId", "table", "slot", 0);
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        RoomAsset old = assets.get("table");
        assets.put("table", moved(old, new Vec3(8, 0, 8), 2));
        replace(assets);
        assertThat(room.item(id).position()).isEqualTo(assets.get("table").surface(0));
        assertThat(room.item(id).position().y()).isEqualTo(old.surfaces().getFirst().y() * 2);
    }

    @Test
    void tallShelfCanBeReachedFromItsOwnFloor() {
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        RoomAsset tall = moved(assets.get("shelf"), new Vec3(1, 0, 0), 2);
        assets.put(tall.id(), tall);
        replace(assets);

        command("TAKE", "assetId", "shelf", "kind", "cup");
        String id = held();
        command("PLACE", "assetId", "shelf", "slot", 3);
        assertThat(room.item(id).position().y()).isGreaterThan(3);
        command("PICKUP", "itemId", id);
        assertThat(held()).isEqualTo(id);
    }

    @Test
    void removedSurfaceDropsItsItemButDoesNotDeleteHeldItems() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String placed = held();
        command("PLACE", "assetId", "table", "slot", 0);
        command("TAKE", "assetId", "shelf", "kind", "cup");
        String inHand = held();
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        assets.remove("table"); assets.remove("shelf");
        replace(assets);
        assertThat(room.item(placed).location()).isEqualTo(ItemState.Location.WORLD);
        assertThat(room.layout().valid(room.item(placed).position(), false)).isTrue();
        assertThat(room.item(inHand).holderId()).isEqualTo("1");
    }

    @Test
    void deletingProducerCancelsCompletionAndPreservesEmptyCup() {
        command("TAKE", "assetId", "machine", "kind", "cup");
        String id = held();
        command("PRODUCE", "assetId", "machine", "kind", "coffee", "itemId", id);
        assertThat(room.assetState("machine").production()).isNotNull();
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        assets.remove("machine"); replace(assets);
        room.tick(10000);
        assertThat(room.item(id).kind()).isEqualTo("cup");
        assertThat(room.item(id).location()).isEqualTo(ItemState.Location.WORLD);
        assertThat(room.assetStates()).doesNotContainKey("machine");
    }

    @Test
    void movingProducerCancelsCompletionAtNewSurface() {
        command("TAKE", "assetId", "machine", "kind", "cup");
        String id = held();
        command("PRODUCE", "assetId", "machine", "kind", "latte", "itemId", id);
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        assets.put("machine", moved(assets.get("machine"), new Vec3(8, 0, 8), 1));
        replace(assets); room.tick(10000);
        assertThat(room.item(id).kind()).isEqualTo("cup");
        assertThat(room.item(id).position()).isEqualTo(assets.get("machine").surface(0));
        assertThat(room.assetState("machine").production()).isNull();
    }

    @Test
    void producerCompletesOnceAndCupCannotBeStolenDuringProduction() {
        command("TAKE", "assetId", "machine", "kind", "cup");
        String id = held();
        command("PRODUCE", "assetId", "machine", "kind", "coffee", "itemId", id);
        assertThatThrownBy(() -> command("PICKUP", "itemId", id)).hasMessage("BUSY");
        room.tick(5200); room.tick(6000);
        assertThat(room.items()).hasSize(1);
        assertThat(room.item(id).kind()).isEqualTo("coffee");
        assertThat(room.item(id).remaining()).isEqualTo(1);
    }

    @Test
    void lateJoinSnapshotContainsThrowTrajectoryAndLandingIsWalkable() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String id = held(); command("THROW", "velocity", Map.of("x", 4, "y", 3, "z", 0));
        room.join(TestRooms.admission("3"), "c", 1300);
        assertThat(room.snapshot("ROOM_SNAPSHOT", "3", "c", 1300).get("items")).asList().contains(room.item(id));
        assertThat(room.item(id).location()).isEqualTo(ItemState.Location.THROWN);
        room.tick(5000);
        assertThat(room.item(id).location()).isEqualTo(ItemState.Location.WORLD);
        assertThat(room.layout().valid(room.item(id).position(), false)).isTrue();
    }

    @Test
    void sameTimestampPacketsCannotMintMovementAllowance() {
        Vec3 start = room.participants().getFirst().position();
        room.move("1", "a", 1, Map.of("x", start.x() + .19, "y", start.y(), "z", start.z(), "yaw", 0, "locomotion", "walking"), 1000);
        assertThatThrownBy(() -> room.move("1", "a", 2, Map.of("x", start.x() + .38, "y", start.y(), "z", start.z(), "yaw", 0, "locomotion", "walking"), 1000))
                .hasMessage("INVALID_MOVEMENT");
    }

    @Test
    void staleGenerationAndExpiredLeaseCannotChangeState() {
        assertThatThrownBy(() -> room.command("1", "old", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cup"), 1200)).hasMessage("CONNECTION_REPLACED");
        assertThatThrownBy(() -> room.command("1", "a", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cup"), 100001)).hasMessage("ACCESS_EXPIRED");
        assertThat(room.items()).isEmpty();
    }

    private void command(String action, Object... pairs) {
        Map<String, Object> payload = new LinkedHashMap<>(); payload.put("action", action);
        for (int index = 0; index < pairs.length; index += 2) payload.put((String) pairs[index], pairs[index + 1]);
        room.command("1", "a", payload, 1200);
    }

    private String held() { return room.participants().getFirst().heldItemId(); }

    private void replace(Map<String, RoomAsset> assets) {
        RoomLayout old = room.layout();
        room.replaceLayout(new RoomLayout(old.revision() + 1, assets, old.geometry(), old.arrival(), old.itemRules()), 1300);
    }

    private static RoomAsset moved(RoomAsset asset, Vec3 position, double scaleY) {
        return new RoomAsset(asset.id(), asset.kind(), position, asset.rotation(), asset.scaleX(), scaleY,
                asset.scaleZ(), asset.width(), asset.depth(), asset.height(), asset.capabilities(), asset.seats(), asset.supplies(),
                asset.products(), asset.slots(), asset.obstacle(), asset.platformHeight(), asset.surfaces(),
                asset.interactionFloor(), asset.productionMs(), asset.cooldownMs());
    }
}
