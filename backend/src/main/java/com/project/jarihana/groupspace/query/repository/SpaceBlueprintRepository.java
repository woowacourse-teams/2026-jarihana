package com.project.jarihana.groupspace.query.repository;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupspace.domain.BlueprintRef;
import com.project.jarihana.groupspace.domain.SpaceBlueprint;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.HashMap;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Repository
public class SpaceBlueprintRepository {
    private static final String BLUEPRINT_DIRECTORY = "contracts/clubhouse/blueprints/";

    private final JdbcClient jdbc;
    private final Map<BlueprintRef, SpaceBlueprint> published;

    public SpaceBlueprintRepository(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.published = loadPublished(mapper);
    }

    public SpaceBlueprint get(BlueprintRef ref) {
        SpaceBlueprint blueprint = published.get(ref);
        if (blueprint == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청한 도면 버전이 없습니다.");
        }
        JsonNode defaultRoom = blueprint.defaultRoom();
        return new SpaceBlueprint(ref, blueprint.geometry().deepCopy(), blueprint.spawn().deepCopy(),
                defaultRoom == null ? null : defaultRoom.deepCopy());
    }

    public SpaceBlueprint getDefault(String templateKey) {
        int version = jdbc.sql("SELECT blueprint_version FROM space_blueprint_default WHERE template_key = ?")
                .param(templateKey).query(Integer.class).optional()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_PARAMETER, "선택할 수 없는 도면입니다."));
        SpaceBlueprint blueprint = get(new BlueprintRef(templateKey, version));
        if (blueprint.defaultRoom() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "초기 배치가 없는 도면입니다.");
        }
        return blueprint;
    }

    private static Map<BlueprintRef, SpaceBlueprint> loadPublished(ObjectMapper mapper) {
        JsonNode index = readResource(mapper, "index.json");
        if (!index.isArray() || index.isEmpty()) {
            throw new IllegalStateException("발행 도면 목록이 비어 있거나 잘못되었습니다.");
        }
        Map<BlueprintRef, SpaceBlueprint> blueprints = new HashMap<>();
        for (JsonNode entry : index) {
            if (!entry.isString()) {
                throw new IllegalStateException("발행 도면 목록에는 파일 경로가 필요합니다.");
            }
            String path = entry.asString();
            SpaceBlueprint blueprint = read(readResource(mapper, path));
            BlueprintRef ref = blueprint.ref();
            if (!path.equals(ref.templateKey() + "/v" + ref.version() + ".json")) {
                throw new IllegalStateException("발행 도면 경로와 내용이 일치하지 않습니다: " + path);
            }
            if (blueprints.putIfAbsent(ref, blueprint) != null) {
                throw new IllegalStateException("중복 발행 도면: " + ref);
            }
        }
        return Map.copyOf(blueprints);
    }

    private static JsonNode readResource(ObjectMapper mapper, String path) {
        try (var stream = new ClassPathResource(BLUEPRINT_DIRECTORY + path).getInputStream()) {
            return mapper.readTree(stream);
        } catch (IOException exception) {
            throw new UncheckedIOException("발행 도면 리소스를 읽을 수 없습니다: " + path, exception);
        }
    }

    private static SpaceBlueprint read(JsonNode entry) {
        JsonNode templateKey = entry.required("templateKey");
        JsonNode version = entry.required("blueprintVersion");
        JsonNode schemaVersion = entry.required("geometrySchemaVersion");
        JsonNode geometry = entry.required("geometry");
        JsonNode spawn = entry.required("spawn");
        JsonNode defaultRoom = entry.required("defaultRoom");
        if (!templateKey.isString() || templateKey.asString().isBlank() || !version.isIntegralNumber()
                || !version.canConvertToInt() || version.intValue() < 1 || !schemaVersion.isIntegralNumber()
                || !schemaVersion.canConvertToInt() || schemaVersion.intValue() != 1 || !geometry.isObject()
                || !spawn.path("x").isNumber() || !spawn.path("z").isNumber()
                || !(defaultRoom.isNull() || defaultRoom.isObject())) {
            throw new IllegalStateException("발행 도면 형식이 잘못되었습니다: " + templateKey + " " + version);
        }
        BlueprintRef ref = new BlueprintRef(templateKey.asString(), version.intValue());
        return new SpaceBlueprint(ref, geometry, spawn, defaultRoom.isNull() ? null : defaultRoom);
    }
}
