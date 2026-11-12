package com.project.jarihana.groupspace.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class RoomDocumentValidator {
    public static final int MAX_BYTES = 2_097_152;
    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final Pattern PHOTO = Pattern.compile("data:image/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}");
    private static final Set<String> COLORS = Set.of("#536bd6", "#7b9b6d", "#d99559", "#c991ba", "#7d8b9d");
    private static final Set<String> LEGACY_KINDS = Set.of("sofa", "armchair", "table", "bookshelf", "plant", "rug", "stool",
            "bench", "beanbag", "diningTable", "gameTable", "roundChair", "clubSofa", "gameCredenza", "loungeRug",
            "gameShelf", "gameChair", "floorLamp", "memory", "musicConsole");
    private static final Set<String> KINDS = Set.of(
            "sofa", "armchair", "table", "bookshelf", "plant",
            "rug", "stool", "bench", "beanbag", "diningTable",
            "gameTable", "roundChair", "clubSofa", "gameCredenza", "loungeRug",
            "gameShelf", "gameChair", "floorLamp", "memory", "musicConsole",
            "libraryShelfWood", "libraryShelfDisplay", "libraryShelfDark", "gameWallBoard", "gameWallArt",
            "gameNeon", "pendantLight", "pendantBulb", "loftPendant", "shelfPendant",
            "climbingWallWide", "climbingWallOverhang", "climbingWallNarrow", "crashMat", "crashMatWide",
            "climbingShoeShelf", "climbingHelmetShelf", "climbingGearShelf", "ropeRack", "climbingPlant",
            "climbingSign", "climbingBoard", "clubPinboard", "cafeCounter", "cafeFridge",
            "kitchenCounter", "kitchenIsland", "kitchenRange", "kitchenFridge", "pantryShelf",
            "cafeCabinet", "feastTable", "menuBoard", "foodMap", "drumKit",
            "guitarRack", "rehearsalKeyboard", "amplifier", "microphoneStand", "mixingDesk",
            "acousticPanel", "bandPoster", "rehearsalStage", "stageLight", "studyDesk",
            "focusDesk", "whiteboard", "projectScreen", "serverRack", "projectShelf",
            "studyCabinet", "projectDisplay", "photoBackdrop", "softbox", "photoTripod",
            "cameraCabinet", "photoEditDesk", "photoPrintBench", "galleryPartition", "photoEquipmentCase",
            "photoReflector", "activityBoard", "clubDashboard",
            "coffeeTable", "cafeTable", "leafyPlant", "vinePlanter",
            "bandNeon", "diningNeon", "studyNeon", "photoNeon", "galleryWall", "posterWall",
            "longCredenza", "worktop", "openDisplayShelf", "wallShelf", "propBooks", "propBookRow", "propBottle", "propCup",
            "propPlant", "propPlates", "propGameBox", "propCamera", "propLaptop", "propFrame", "propLamp",
            "propGameBoard", "propMonitor", "propCanisters", "propPedals", "hangingLamp", "trackLight", "ceilingBeam", "acousticCloud",
            "wallPrint", "acousticTile", "pictureLight", "loftPartition", "loftGlassPartition", "lowEdgeLight");
    private static final Set<String> SURFACES = Set.of("table", "diningTable", "feastTable", "gameTable", "coffeeTable",
            "cafeTable", "kitchenIsland", "kitchenCounter", "cafeCabinet", "gameCredenza", "bookshelf", "pantryShelf",
            "libraryShelfWood", "libraryShelfDark", "libraryShelfDisplay", "studyDesk", "focusDesk", "photoEditDesk",
            "photoPrintBench", "studyCabinet", "mixingDesk", "cameraCabinet", "longCredenza", "openDisplayShelf", "worktop", "wallShelf");
    private final ObjectMapper mapper;

    public String validateAndSerialize(JsonNode room) {
        require(room != null && room.isObject());
        String document = mapper.writeValueAsString(room);
        if (document.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공간과 사진의 전체 용량은 2MB 이하여야 합니다.");
        }
        fields(room, Set.of("version", "name", "template", "theme", "avatarColor", "accentColor", "matColor",
                "food", "coverPhoto", "notice", "atmosphere", "items"));
        integer(room.get("version"), 8, 11);
        int version = room.get("version").intValue();
        require(!text(room.get("name"), 30).isBlank());
        String template = choice(room.get("template"), version >= 9
                ? Set.of("lounge", "climbing", "boardgame", "dining", "band", "study", "photo")
                : Set.of("lounge", "climbing", "boardgame", "dining", "band"));
        choice(room.get("theme"), version >= 9
                ? Set.of("blue", "sage", "rose", "wood", "chalk", "walnut", "rehearsal", "studio", "gallery")
                : Set.of("blue", "sage", "rose", "wood", "chalk", "walnut"));
        choice(room.get("avatarColor"), Set.of("#536bd6", "#7b9b6d", "#d99559", "#c991ba"));
        choice(room.get("accentColor"), COLORS);
        choice(room.get("matColor"), COLORS);
        choice(room.get("food"), Set.of("pizza", "ramen", "dessert"));
        photo(room.get("coverPhoto"));
        text(room.get("notice"), 100);
        atmosphere(room.get("atmosphere"));
        JsonNode items = room.get("items");
        require(items != null && items.isArray() && items.size() <= (version >= 10 ? 400 : version == 9 ? 160 : 64));
        Set<String> ids = new HashSet<>();
        Map<String, JsonNode> byId = new HashMap<>();
        for (JsonNode item : items) {
            fields(item, Set.of("id", "kind", "x", "z", "rotation", "level", "color", "title", "note", "photo", "link",
                    "scaleX", "scaleY", "scaleZ", "elevation", "finish", "variant", "parentId", "surfaceIndex"));
            String id = text(item.get("id"), 80);
            require(!id.isEmpty() && ids.add(id));
            byId.put(id, item);
            String kind = choice(item.get("kind"), version >= 9 ? KINDS : LEGACY_KINDS);
            number(item.get("x"), -64, 64);
            number(item.get("z"), -64, 64);
            integer(item.get("rotation"), 0, 3);
            if (item.has("level")) {
                boolean mezzanine = version >= 9 || Set.of("climbing", "boardgame").contains(template);
                integer(item.get("level"), 0, mezzanine ? 1 : 0);
            }
            for (String axis : Set.of("scaleX", "scaleY", "scaleZ")) if (item.has(axis)) number(item.get(axis), 0.25, 3);
            if (item.has("elevation")) number(item.get("elevation"), 0, 14);
            if (item.has("variant")) integer(item.get("variant"), 0, 5);
            if (item.has("finish")) choice(item.get("finish"), Set.of("auto", "oak", "walnut", "stone", "fabric", "metal"));
            if (item.has("parentId")) require(!text(item.get("parentId"), 80).equals(id) && kind.startsWith("prop"));
            if (item.has("surfaceIndex")) { require(item.has("parentId")); integer(item.get("surfaceIndex"), 0, 4); }
            if (item.has("color")) color(item.get("color"), false);
            if (item.has("title")) text(item.get("title"), 40);
            if (item.has("note")) text(item.get("note"), 500);
            if (item.has("photo")) { require(kind.equals("memory")); photo(item.get("photo")); }
            if (item.has("link")) { require(kind.equals("memory")); link(item.get("link")); }
        }
        for (JsonNode item : items) {
            if (!item.has("parentId")) continue;
            JsonNode parent = byId.get(item.get("parentId").asString());
            require(parent != null && !parent.has("parentId") && SURFACES.contains(parent.get("kind").asString()));
            int level = item.has("level") ? item.get("level").intValue() : 0;
            int parentLevel = parent.has("level") ? parent.get("level").intValue() : 0;
            require(level == parentLevel && (!item.has("elevation") || item.get("elevation").doubleValue() == 0));
            int slots = Set.of("bookshelf", "pantryShelf").contains(parent.get("kind").asString()) ? 4
                    : parent.get("kind").asString().equals("openDisplayShelf") ? 5
                    : parent.get("kind").asString().equals("kitchenCounter") ? 3 : 1;
            if (item.has("surfaceIndex")) integer(item.get("surfaceIndex"), 0, slots - 1);
        }
        return document;
    }

    private void atmosphere(JsonNode value) {
        fields(value, Set.of("backgroundColor", "backgroundStyle", "ambient", "sunlight", "warmth", "sunAngle",
                "lamps", "shadowSoftness", "shadows", "wallColor", "floorColor",
                "wallMaterial", "floorMaterial", "wallPatternScale", "floorPatternScale", "outdoors"));
        color(value.get("backgroundColor"), false);
        choice(value.get("backgroundStyle"), Set.of("gradient", "solid"));
        number(value.get("ambient"), 0, 150);
        number(value.get("sunlight"), 0, 150);
        number(value.get("warmth"), 0, 100);
        number(value.get("sunAngle"), 0, 360);
        number(value.get("lamps"), 0, 150);
        number(value.get("shadowSoftness"), 0, 100);
        require(value.has("shadows") && value.get("shadows").isBoolean());
        color(value.get("wallColor"), true);
        color(value.get("floorColor"), true);
        if (value.has("wallMaterial")) choice(value.get("wallMaterial"),
                Set.of("auto", "plaster", "limewash", "brick", "wallpaper", "woodpanel", "acoustic"));
        if (value.has("floorMaterial")) choice(value.get("floorMaterial"),
                Set.of("auto", "oak", "walnut", "herringbone", "concrete", "stone", "terrazzo", "checker"));
        if (value.has("wallPatternScale")) number(value.get("wallPatternScale"), 0.5, 2);
        if (value.has("floorPatternScale")) number(value.get("floorPatternScale"), 0.5, 2);
        if (value.has("outdoors")) {
            JsonNode outdoors = value.get("outdoors");
            fields(outdoors, Set.of("mode", "phase", "weather"));
            choice(outdoors.get("mode"), Set.of("live", "fixed", "custom"));
            choice(outdoors.get("phase"), Set.of("dawn", "day", "dusk", "night"));
            choice(outdoors.get("weather"), Set.of("clear", "cloudy", "rain", "snow"));
        }
    }

    private void fields(JsonNode node, Set<String> allowed) {
        require(node != null && node.isObject());
        require(allowed.containsAll(node.propertyNames()));
    }

    private String text(JsonNode value, int max) {
        require(value != null && value.isString());
        String text = value.asString();
        require(text.length() <= max);
        return text;
    }

    private String choice(JsonNode node, Set<String> allowed) {
        String value = text(node, 80);
        require(allowed.contains(value));
        return value;
    }

    private void color(JsonNode node, boolean emptyAllowed) {
        String value = text(node, 7);
        require((emptyAllowed && value.isEmpty()) || COLOR.matcher(value).matches());
    }

    private void photo(JsonNode node) {
        String value = text(node, 220_000);
        require(value.isEmpty() || PHOTO.matcher(value).matches());
    }

    private void link(JsonNode node) {
        String value = text(node, 1_000);
        if (value.isEmpty()) return;
        try {
            URI uri = new URI(value);
            require(("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    && uri.getHost() != null && uri.getRawUserInfo() == null);
        } catch (URISyntaxException exception) {
            throw invalid();
        }
    }

    private void integer(JsonNode node, int min, int max) {
        require(node != null && node.isIntegralNumber());
        number(node, min, max);
    }

    private void number(JsonNode node, double min, double max) {
        require(node != null && node.isNumber());
        double value = node.doubleValue();
        require(Double.isFinite(value) && value >= min && value <= max);
    }

    private void require(boolean condition) { if (!condition) throw invalid(); }
    private BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "공간 데이터 형식 또는 허용 범위를 확인해 주세요.");
    }
}
