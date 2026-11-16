package com.project.jarihana.groupmusic.stream;

import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class GroupMusicStreamRepository {
    private final JdbcClient jdbc;

    public Optional<GroupMusicChanged> findRevision(long groupId) {
        return jdbc.sql("""
                        SELECT g.id, coalesce(m.revision, 0) AS revision,
                               coalesce(m.playback_revision, 0) AS playback_revision
                        FROM groups g LEFT JOIN group_music m ON m.group_id = g.id
                        WHERE g.id = :groupId
                        """)
                .param("groupId", groupId)
                .query((row, index) -> new GroupMusicChanged(row.getLong("id"),
                        row.getLong("revision"), row.getLong("playback_revision")))
                .optional();
    }
}
