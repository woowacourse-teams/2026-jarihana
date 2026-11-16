package com.project.jarihana.groupspace.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import java.io.IOException;
import tools.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class RoomDocumentValidatorTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final RoomDocumentValidator validator = new RoomDocumentValidator(mapper);

    @DisplayName("참고 이미지용 가구와 조명을 v9 공간에 저장할 수 있다")
    @ParameterizedTest
    @ValueSource(strings = {"coffeeTable", "cafeTable", "leafyPlant", "vinePlanter", "bandNeon", "diningNeon", "studyNeon", "photoNeon", "galleryWall", "posterWall"})
    void acceptsReferenceFurnishings(String kind) {
        ObjectNode room = roomWith(kind);
        assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
    }

    @DisplayName("등록되지 않은 에셋은 여전히 거절한다")
    @Test
    void rejectsUnknownAsset() {
        assertThatThrownBy(() -> validator.validateAndSerialize(roomWith("unregisteredAsset")))
                .isInstanceOf(BusinessException.class);
    }

    @DisplayName("벽과 바닥 재질 및 패턴 크기를 보존한다")
    @Test
    void acceptsSurfaceCustomization() {
        // Given
        ObjectNode room = roomWith("coffeeTable");
        ObjectNode atmosphere = (ObjectNode) room.get("atmosphere");
        atmosphere.put("wallMaterial", "brick").put("floorMaterial", "herringbone")
                .put("wallPatternScale", 0.5).put("floorPatternScale", 2);
        // When / Then
        assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
    }

    @DisplayName("지원하지 않는 재질과 패턴 크기는 거절한다")
    @Test
    void rejectsInvalidSurfaceCustomization() {
        // Given
        ObjectNode room = roomWith("coffeeTable");
        ObjectNode atmosphere = (ObjectNode) room.get("atmosphere");
        atmosphere.put("floorMaterial", "remote-texture");
        // When / Then
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
        atmosphere.put("floorMaterial", "oak").put("floorPatternScale", 0);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
        atmosphere.put("floorPatternScale", 3);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
    }

    @DisplayName("에셋 크기와 선반 연결 정보를 저장하고 범위를 검증한다")
    @Test
    void acceptsAssetTransformAndAttachment() {
        // Given
        ObjectNode room = roomWith("longCredenza");
        ObjectNode parent = (ObjectNode) room.withArray("items").get(0);
        parent.put("scaleX", 1.5).put("scaleY", 1.1).put("finish", "walnut");
        room.withArray("items").addObject().put("id", "mug").put("kind", "propCup")
                .put("x", 0).put("z", 0).put("rotation", 0).put("parentId", "furnishing")
                .put("surfaceIndex", 0).put("variant", 2);
        // When / Then
        assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
        parent.put("scaleY", 9);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
    }

    @DisplayName("존재하지 않는 가구나 소품을 부모로 연결할 수 없다")
    @Test
    void rejectsDanglingAndRecursiveAttachment() {
        // Given
        ObjectNode room = roomWith("propCup");
        ObjectNode prop = (ObjectNode) room.withArray("items").get(0);
        prop.put("parentId", "missing").put("surfaceIndex", 0);
        // When / Then
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
        prop.put("parentId", "furnishing");
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
    }

    @DisplayName("프론트엔드의 v10 전체 테마와 연결된 소품을 손실 없이 저장한다")
    @ParameterizedTest
    @ValueSource(strings = {"climbing", "boardgame", "dining", "band", "study", "photo"})
    void acceptsCompleteEditablePresets(String theme) throws IOException {
        // Given
        try (var input = getClass().getResourceAsStream("/group-space-v10-presets.json")) {
            JsonNode room = mapper.readTree(input).get(theme);
            // When / Then
            assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
        }
    }

    @DisplayName("테마별 새 구조 v11 프리셋 여섯 개를 손실 없이 저장한다")
    @ParameterizedTest
    @ValueSource(strings = {"climbing", "boardgame", "dining", "band", "study", "photo"})
    void acceptsVersionElevenPresets(String theme) throws IOException {
        // Given
        try (var input = getClass().getResourceAsStream("/group-space-v11-presets.json")) {
            JsonNode room = mapper.readTree(input).get(theme);
            // When / Then
            assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
        }
    }

    @DisplayName("구조 개정 번호를 보존하고 지원하지 않는 개정은 거절한다")
    @Test
    void preservesSupportedArchitectureRevision() {
        // Given
        ObjectNode room = roomWith("coffeeTable");
        room.put("version", 11);
        // When / Then
        assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
        room.put("version", 12);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
    }

    @DisplayName("v10과 v11은 400개까지 허용하고 초과 에셋은 거절한다")
    @ParameterizedTest
    @ValueSource(ints = {10, 11})
    void enforcesExpandedCapacity(int version) {
        ObjectNode room = roomWith("table").put("version", version);
        var items = room.withArray("items");
        for (int index = 1; index < 400; index++) {
            items.addObject().put("id", "item-" + index).put("kind", "table")
                    .put("x", 0).put("z", 0).put("rotation", 0);
        }
        assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
        items.addObject().put("id", "overflow").put("kind", "table")
                .put("x", 0).put("z", 0).put("rotation", 0);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
    }

    @DisplayName("선반 부착은 같은 층의 유효한 표면만 허용한다")
    @Test
    void rejectsInvalidAttachmentPlacement() {
        ObjectNode room = roomWith("bookshelf").put("version", 11);
        ObjectNode prop = room.withArray("items").addObject().put("id", "cup").put("kind", "propCup")
                .put("x", 0).put("z", 0).put("rotation", 0).put("parentId", "furnishing")
                .put("surfaceIndex", 3);
        assertThat(mapper.readTree(validator.validateAndSerialize(room))).isEqualTo(room);
        prop.put("surfaceIndex", 4);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
        prop.put("surfaceIndex", 0).put("level", 1);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
        prop.put("level", 0).put("elevation", 1);
        assertThatThrownBy(() -> validator.validateAndSerialize(room)).isInstanceOf(BusinessException.class);
    }

    private ObjectNode roomWith(String kind) {
        ObjectNode room = (ObjectNode) mapper.readTree("""
                {"version":9,"name":"우리 아지트","template":"boardgame","theme":"walnut",
                 "avatarColor":"#536bd6","accentColor":"#536bd6","matColor":"#7b9b6d",
                 "food":"pizza","coverPhoto":"","notice":"",
                 "atmosphere":{"backgroundColor":"#55445e","backgroundStyle":"gradient","ambient":45,
                 "sunlight":25,"warmth":88,"sunAngle":330,"lamps":135,"shadowSoftness":60,
                 "shadows":true,"wallColor":"","floorColor":""},"items":[]}
                """);
        room.withArray("items").addObject().put("id", "furnishing").put("kind", kind)
                .put("x", 0).put("z", 0).put("rotation", 0);
        return room;
    }
}
