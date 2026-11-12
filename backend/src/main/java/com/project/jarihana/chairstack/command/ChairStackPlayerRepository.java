package com.project.jarihana.chairstack.command;

import com.project.jarihana.chairstack.domain.ChairStackOwner;
import com.project.jarihana.chairstack.domain.ChairStackPhysics;
import com.project.jarihana.chairstack.domain.ChairStackRun;
import com.project.jarihana.chairstack.domain.ChairStackRules;
import com.project.jarihana.chairstack.domain.ChairStackToyRules.Pose;
import java.util.stream.IntStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ChairStackPlayerRepository {

    private final JdbcClient jdbc;

    public Optional<Player> find(ChairStackOwner owner) {
        return lookup(owner, "");
    }

    public Optional<Player> lock(ChairStackOwner owner) {
        return lookup(owner, " FOR UPDATE");
    }

    private Optional<Player> lookup(ChairStackOwner owner, String lock) {
        if (owner.guest() && owner.guestDigest() == null) {
            return Optional.empty();
        }
        String column = owner.guest() ? "guest_digest" : "member_id";
        Object identity = owner.guest() ? owner.guestDigest() : owner.memberId();
        return jdbc.sql("SELECT * FROM chair_stack_player WHERE " + column + " = :owner" + lock)
                .param("owner", identity).query(this::player).optional();
    }

    public boolean create(ChairStackOwner owner, String nickname, UUID runId, UUID requestId, OffsetDateTime now) {
        return jdbc.sql("""
                INSERT INTO chair_stack_player (member_id, guest_digest, nickname, run_id, start_request_id,
                    started_at, updated_at, physics_poses, physics_profile)
                VALUES (:member, :guest, :nickname, :run, :request, :now, :now, '', :profile)
                ON CONFLICT DO NOTHING
                """)
                .param("member", owner.memberId(), Types.BIGINT).param("guest", owner.guestDigest(), Types.CHAR)
                .param("nickname", nickname).param("run", runId).param("request", requestId).param("now", now)
                .param("profile", ChairStackPhysics.PhysicsProfile.INTERLOCKING.version()).update() == 1;
    }

    public void restart(long playerId, String nickname, UUID runId, UUID requestId, OffsetDateTime now) {
        jdbc.sql("""
                UPDATE chair_stack_player SET nickname = :nickname, run_id = :run, start_request_id = :request,
                    last_drop_id = NULL, positions = '', toy_poses = NULL, physics_poses = '', physics_profile = :profile,
                    stress = 0, failed_layer = NULL,
                    started_at = :now, updated_at = :now
                WHERE id = :id
                """)
                .param("id", playerId).param("nickname", nickname).param("run", runId)
                .param("request", requestId).param("now", now)
                .param("profile", ChairStackPhysics.PhysicsProfile.INTERLOCKING.version()).update();
    }

    public void saveDrop(Player player, ChairStackRun run, UUID requestId) {
        int score = run.positions().size();
        boolean best = run.finished() && score > player.bestScore();
        String positions = run.positions().stream().map(String::valueOf).collect(Collectors.joining(","));
        String poses = run.toyMode() ? run.toyPoses().stream()
                .map(pose -> pose.y() + ":" + pose.orientation()).collect(Collectors.joining(",")) : null;
        String physics = run.physicsMode() ? run.physicsPoses().stream()
                .map(pose -> pose.x() + ":" + pose.y() + ":" + pose.angle()
                        + (pose.mirror() == null ? "" : ":" + pose.mirror())).collect(Collectors.joining(",")) : null;
        jdbc.sql("""
                UPDATE chair_stack_player SET toy_poses = :poses, physics_poses = :physics, positions = :positions, stress = :stress, failed_layer = :failed,
                    last_drop_id = :request, updated_at = :now,
                    best_score = CASE WHEN :best THEN :score ELSE best_score END,
                    best_at = CASE WHEN :best THEN :now ELSE best_at END,
                    best_nickname = CASE WHEN :best THEN nickname ELSE best_nickname END
                WHERE id = :id
                """)
                .param("id", player.id()).param("poses", poses, Types.VARCHAR)
                .param("physics", physics, Types.VARCHAR).param("positions", positions).param("stress", run.stress())
                .param("failed", run.failedLayer(), Types.INTEGER).param("request", requestId)
                .param("now", run.updatedAt()).param("best", best).param("score", score).update();
    }

    private Player player(ResultSet row, int rowNumber) throws SQLException {
        String stored = row.getString("positions");
        List<Integer> positions = stored.isEmpty() ? List.of()
                : Arrays.stream(stored.split(",")).map(Integer::valueOf).toList();
        Integer failed = row.getObject("failed_layer", Integer.class);
        var run = new ChairStackRun(row.getObject("run_id", UUID.class), positions, row.getInt("stress"),
                failed, row.getObject("updated_at", OffsetDateTime.class),
                parsePoses(row.getString("toy_poses"), positions),
                parsePhysics(row.getString("physics_poses"), positions.size() + (failed == null ? 0 : 1)),
                ChairStackPhysics.PhysicsProfile.fromVersion(row.getInt("physics_profile")));
        return new Player(row.getLong("id"), row.getString("nickname"), run,
                row.getObject("start_request_id", UUID.class), row.getObject("last_drop_id", UUID.class),
                row.getObject("started_at", OffsetDateTime.class), row.getInt("best_score"));
    }

    private List<Pose> parsePoses(String stored, List<Integer> positions) {
        if (stored == null) {
            return null;
        }
        String[] fields = stored.isEmpty() ? new String[0] : stored.split(",");
        if (fields.length != positions.size()) {
            return null;
        }
        return IntStream.range(0, fields.length).mapToObj(index -> {
            String[] pose = fields[index].split(":");
            return new Pose(positions.get(index) / ChairStackRules.SCALE,
                    Integer.parseInt(pose[0]), Integer.parseInt(pose[1]));
        }).toList();
    }

    private List<ChairStackPhysics.Pose> parsePhysics(String stored, int size) {
        if (stored == null) return null;
        String[] fields = stored.isEmpty() ? new String[0] : stored.split(",");
        if (fields.length != size) return null;
        return Arrays.stream(fields).map(field -> {
            String[] pose = field.split(":");
            return new ChairStackPhysics.Pose(Double.parseDouble(pose[0]), Double.parseDouble(pose[1]),
                    Double.parseDouble(pose[2]), pose.length > 3 ? Boolean.valueOf(pose[3]) : null);
        }).toList();
    }

    public record Player(long id, String nickname, ChairStackRun run, UUID startRequestId,
                         UUID lastDropId, OffsetDateTime startedAt, int bestScore) {
    }
}
