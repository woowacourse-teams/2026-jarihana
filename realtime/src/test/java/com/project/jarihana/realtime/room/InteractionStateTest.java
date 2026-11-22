package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.realtime.layout.RoomAsset;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.layout.TestBlueprints;
import com.project.jarihana.realtime.room.domain.ItemState;
import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;

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
    void surfaceHasOneOwnerPerSlotAndRejectsStorageOnlyIndexes() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String id = held();
        command("PLACE", "assetId", "shelf", "slot", 1);
        assertThat(room.item(id).assetId()).isEqualTo("shelf");
        assertThat(room.item(id).slot()).isEqualTo(1);
        assertThat(room.item(id).position()).isNull();
        room.command("2", "b", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cookie"), 1200);
        assertThatThrownBy(() -> room.command("2", "b", Map.of("action", "PLACE", "assetId", "shelf", "slot", 1), 1200)).hasMessage("OCCUPIED");
        assertThatThrownBy(() -> room.command("2", "b", Map.of("action", "PLACE", "assetId", "shelf", "slot", 4), 1200)).hasMessage("INVALID_SLOT");
    }

    @Test
    void sameIndexCanHoldAStoredAndASurfaceItemIndependently() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String placed = held();
        command("PLACE", "assetId", "shelf", "slot", 0);
        command("TAKE", "assetId", "shelf", "kind", "cup");
        String stored = held();
        command("RETURN", "assetId", "shelf");

        assertThat(room.item(placed).slot()).isZero();
        assertThat(room.item(stored).slot()).isZero();
        assertThat(room.item(placed).location()).isEqualTo(ItemState.Location.SURFACE);
        assertThat(room.item(stored).location()).isEqualTo(ItemState.Location.STORAGE);
        assertThat(wireItem(placed).position()).isNotNull();
        assertThat(wireItem(stored).position()).isNotNull();
        command("PICKUP", "itemId", stored);
        assertThat(held()).isEqualTo(stored);
        assertThat(room.item(placed).location()).isEqualTo(ItemState.Location.SURFACE);
    }

    @Test
    void changedSurfacePreservesItsSlotReferenceInSnapshots() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String id = held();
        command("PLACE", "assetId", "table", "slot", 0);
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        RoomAsset old = assets.get("table");
        assets.put("table", moved(old, new Vec3(8, 0, 8), 1, 2));
        ItemState attached = room.item(id);
        assertThat(wireItem(id).position()).isEqualTo(new Vec3(0, 0.9, 1.105));
        replace(assets);
        assertThat(room.item(id)).isEqualTo(attached);
        assertThat(wireItem(id).position()).isEqualTo(new Vec3(8.105, 1.8, 8));
    }

    @Test
    void tallShelfCanBeReachedFromItsOwnFloor() {
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        RoomAsset tall = moved(assets.get("shelf"), new Vec3(1, 0, 0), 0, 2);
        assets.put(tall.id(), tall);
        replace(assets);

        command("TAKE", "assetId", "shelf", "kind", "cup");
        String id = held();
        command("PLACE", "assetId", "shelf", "slot", 3);
        assertThat(wireItem(id).slot()).isEqualTo(3);
        command("PICKUP", "itemId", id);
        assertThat(held()).isEqualTo(id);
    }

    @Test
    void removingFurnitureRemovesItsAttachmentsButPreservesItemsSourcedThere() {
        command("TAKE", "assetId", "machine", "kind", "cup");
        command("PLACE", "assetId", "shelf", "slot", 0);
        command("TAKE", "assetId", "shelf", "kind", "cup");
        command("RETURN", "assetId", "shelf");
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String dropped = held();
        command("DROP");
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String thrown = held();
        command("THROW");
        command("TAKE", "assetId", "shelf", "kind", "tea");
        String inHand = held();
        commandFor("2", "b", "TAKE", "assetId", "shelf", "kind", "cookie");
        String placedElsewhere = room.participants().get(1).heldItemId();
        commandFor("2", "b", "PLACE", "assetId", "table", "slot", 0);
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        assets.remove("shelf");
        replace(assets);
        assertThat(room.items()).extracting(ItemState::id).containsExactlyInAnyOrder(dropped, thrown, inHand, placedElsewhere);
        assertThat(room.item(dropped).location()).isEqualTo(ItemState.Location.WORLD);
        assertThat(room.item(thrown).location()).isEqualTo(ItemState.Location.THROWN);
        assertThat(room.item(inHand).holderId()).isEqualTo("1");
        assertThat(room.item(placedElsewhere).assetId()).isEqualTo("table");
        assertThat(room.items()).extracting(ItemState::sourceAssetId).containsOnly("shelf");
    }

    @Test
    void deletingProducerCancelsCompletionAndRemovesItsCup() {
        command("TAKE", "assetId", "machine", "kind", "cup");
        String id = held();
        command("PRODUCE", "assetId", "machine", "kind", "coffee", "itemId", id);
        assertThat(room.assetState("machine").production()).isNotNull();
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        assets.remove("machine"); replace(assets);
        room.tick(10000);
        assertThat(room.items()).isEmpty();
        assertThat(room.assetStates()).doesNotContainKey("machine");
    }

    @Test
    void movingProducerCancelsCompletionAtNewSurface() {
        command("TAKE", "assetId", "machine", "kind", "cup");
        String id = held();
        command("PRODUCE", "assetId", "machine", "kind", "latte", "itemId", id);
        Map<String, RoomAsset> assets = new LinkedHashMap<>(room.layout().assets());
        assets.put("machine", moved(assets.get("machine"), new Vec3(8, 0, 8), 0, 1));
        replace(assets); room.tick(10000);
        assertThat(room.item(id).kind()).isEqualTo("cup");
        assertThat(room.item(id).slot()).isZero();
        assertThat(wireItem(id).assetId()).isEqualTo("machine");
        assertThat(wireItem(id).position()).isEqualTo(new Vec3(8, 0.96, 8.105));
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
    void ruleRefreshRemovesInvalidAttachmentsAndCancelsAChangedProducer() {
        command("TAKE", "assetId", "shelf", "kind", "cup");
        String placed = held();
        command("PLACE", "assetId", "shelf", "slot", 3);
        command("TAKE", "assetId", "shelf", "kind", "tea");
        String stored = held();
        command("RETURN", "assetId", "shelf");
        command("TAKE", "assetId", "machine", "kind", "cup");
        String cup = held();
        command("PRODUCE", "assetId", "machine", "kind", "coffee");

        var furniture = TestBlueprints.FURNITURE.deepCopy();
        var pantry = furniture.path("pantryShelf").path("interaction");
        ((ObjectNode) pantry.path("surface")).put("slots", 1);
        ((ObjectNode) pantry.path("storage")).putArray("kinds").add("cup");
        var producer = (ObjectNode) furniture.path("cafeCounter").path("interaction").path("producer");
        producer.putArray("kinds").add("latte");
        room.replaceLayout(TestRooms.layout(1, 0, 2, furniture), 1300);
        room.tick(5200);

        assertThat(room.items()).extracting(ItemState::id).containsExactly(cup).doesNotContain(placed, stored);
        assertThat(room.item(cup).kind()).isEqualTo("cup");
        assertThat(room.assetState("machine").production()).isNull();
        assertThatThrownBy(() -> room.command("1", "a", Map.of("action", "TAKE", "assetId", "shelf", "kind", "tea"), 5300))
                .hasMessage("INVALID_ITEM_KIND");
        assertThatThrownBy(() -> room.command("1", "a",
                Map.of("action", "PRODUCE", "assetId", "machine", "kind", "coffee", "itemId", cup), 5300))
                .hasMessage("INVALID_ITEM_KIND");
        room.command("1", "a", Map.of("action", "PRODUCE", "assetId", "machine", "kind", "latte", "itemId", cup), 5300);
        room.tick(10000);
        assertThat(room.item(cup).kind()).isEqualTo("latte");
    }

    @Test
    void portableRuleRefreshReconcilesHeldItemsAndInFlightThrowsWithoutChangingTheLayoutRevision() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String cookie = held();
        command("THROW");
        command("TAKE", "assetId", "shelf", "kind", "tea");
        String tea = held();
        command("SIT", "assetId", "sofa", "slot", 0);
        command("POSE", "pose", "drinking");
        commandFor("2", "b", "TAKE", "assetId", "shelf", "kind", "cup");
        String cup = room.participants().stream().filter(actor -> actor.memberId().equals("2")).findFirst().orElseThrow().heldItemId();

        var items = TestBlueprints.PORTABLE_ITEMS.deepCopy();
        ((ObjectNode) items.path("cookie")).put("throwable", false);
        ((ObjectNode) items.path("cup")).put("portable", false);
        ((ObjectNode) items.path("tea")).put("consumable", false);
        assertThat(room.replaceLayout(TestRooms.layout(1, 0, 2, TestBlueprints.FURNITURE, items), 1300)).isTrue();

        assertThat(room.layoutRevision()).isEqualTo(1);
        assertThat(room.snapshot("ROOM_STATE", "1", "a", 1300, true)).containsEntry("catalogGeneration", 2L);
        assertThat(room.item(cookie).location()).isEqualTo(ItemState.Location.WORLD);
        assertThat(room.layout().valid(room.item(cookie).position(), false)).isTrue();
        assertThat(room.items()).extracting(ItemState::id).doesNotContain(cup);
        assertThat(room.participants()).filteredOn(actor -> actor.memberId().equals("2"))
                .allSatisfy(actor -> assertThat(actor.heldItemId()).isNull());
        assertThat(held()).isEqualTo(tea);
        assertThat(room.participants().getFirst().pose()).isEqualTo("relaxed");
        assertThatThrownBy(() -> command("CONSUME")).hasMessage("NOT_CONSUMABLE");
        assertThatThrownBy(() -> command("POSE", "pose", "drinking")).hasMessage("ITEM_REQUIRED");
    }

    @Test
    void portableRuleRefreshCancelsOnlyProductionThatCanNoLongerCreateAValidOutput() {
        command("TAKE", "assetId", "machine", "kind", "cup");
        String cup = held();
        command("PRODUCE", "assetId", "machine", "kind", "coffee");

        var items = TestBlueprints.PORTABLE_ITEMS.deepCopy();
        ((ObjectNode) items.path("coffee")).put("portable", false);
        room.replaceLayout(TestRooms.layout(1, 0, 2, TestBlueprints.FURNITURE, items), 1300);
        room.tick(5200);

        assertThat(room.assetState("machine").production()).isNull();
        assertThat(room.item(cup).kind()).isEqualTo("cup");
        assertThatThrownBy(() -> command("PRODUCE", "assetId", "machine", "kind", "coffee", "itemId", cup))
                .hasMessage("INVALID_ITEM_KIND");
        command("PRODUCE", "assetId", "machine", "kind", "latte", "itemId", cup);
        room.tick(6300);
        assertThat(room.item(cup).kind()).isEqualTo("latte");
    }

    @Test
    void lateJoinSnapshotContainsThrowTrajectoryAndLandingIsWalkable() {
        command("TAKE", "assetId", "shelf", "kind", "cookie");
        String id = held(); command("THROW", "velocity", Map.of("x", 4, "y", 3, "z", 0));
        room.join(TestRooms.admission("3"), "c", 1300);
        assertThat(room.snapshot("ROOM_SNAPSHOT", "3", "c", 1300, true).get("items")).asList().contains(room.item(id));
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
        commandFor("1", "a", action, pairs);
    }

    private void commandFor(String memberId, String generation, String action, Object... pairs) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("action", action);
        for (int index = 0; index < pairs.length; index += 2) payload.put((String) pairs[index], pairs[index + 1]);
        room.command(memberId, generation, payload, 1200);
    }

    private ItemState wireItem(String id) {
        List<?> items = (List<?>) room.snapshot("ROOM_SNAPSHOT", "1", "a", 1300, true).get("items");
        return items.stream().map(ItemState.class::cast).filter(item -> item.id().equals(id)).findFirst().orElseThrow();
    }

    private String held() { return room.participants().getFirst().heldItemId(); }

    private void replace(Map<String, RoomAsset> assets) {
        RoomLayout old = room.layout();
        room.replaceLayout(new RoomLayout(old.revision() + 1, old.catalogGeneration(),
                assets, old.geometry(), old.arrival(), old.itemRules()), 1300);
    }

    private static RoomAsset moved(RoomAsset asset, Vec3 position, double rotation, double scaleY) {
        return new RoomAsset(asset.id(), asset.kind(), position, rotation, asset.scaleX(), scaleY,
                asset.scaleZ(), asset.width(), asset.depth(), asset.height(), asset.capabilities(), asset.seatCount(), asset.supplies(),
                asset.products(), asset.storageCapacity(), asset.obstacle(), asset.platformHeight(), asset.surfaceSlots(),
                asset.interactionFloor(), asset.productionMs(), asset.cooldownMs());
    }
}
