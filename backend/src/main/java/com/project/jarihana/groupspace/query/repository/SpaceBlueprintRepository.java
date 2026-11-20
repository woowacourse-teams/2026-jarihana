package com.project.jarihana.groupspace.query.repository;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupspace.domain.BlueprintRef;
import com.project.jarihana.groupspace.domain.SpaceBlueprint;
import java.sql.ResultSet;
import java.sql.SQLException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
@RequiredArgsConstructor
public class SpaceBlueprintRepository {
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final Cache<BlueprintRef, SpaceBlueprint> published = Caffeine.newBuilder().maximumSize(256).build();

    public SpaceBlueprint get(BlueprintRef ref) {
        return published.get(ref, this::loadPublished);
    }

    private SpaceBlueprint loadPublished(BlueprintRef ref) {
        return jdbc.sql("""
                SELECT template_key, blueprint_version, geometry, geometry_schema_version, spawn, default_room
                FROM space_blueprint JOIN space_blueprint_runtime USING (template_key, blueprint_version)
                WHERE template_key = ? AND blueprint_version = ?
                """)
                .params(ref.templateKey(), ref.version()).query(this::read).optional()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_PARAMETER, "요청한 도면 버전이 없습니다."));
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

    private SpaceBlueprint read(ResultSet row, int index) throws SQLException {
        if (row.getInt("geometry_schema_version") != 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "지원하지 않는 도면 형식입니다.");
        }
        String defaultRoom = row.getString("default_room");
        return new SpaceBlueprint(new BlueprintRef(row.getString("template_key"), row.getInt("blueprint_version")),
                mapper.readTree(row.getString("geometry")), mapper.readTree(row.getString("spawn")),
                defaultRoom == null ? null : mapper.readTree(defaultRoom));
    }
}
