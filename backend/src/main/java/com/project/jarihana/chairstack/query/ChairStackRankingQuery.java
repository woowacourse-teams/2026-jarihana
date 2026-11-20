package com.project.jarihana.chairstack.query;

import com.project.jarihana.chairstack.command.ChairStackPlayerRepository;
import com.project.jarihana.chairstack.domain.ChairStackOwner;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ChairStackRankingQuery {

    private static final String SELECT = """
            SELECT p.id, p.best_nickname, p.best_score, p.best_at, p.member_id IS NULL AS guest,
                1 + (SELECT COUNT(*) FROM chair_stack_player above WHERE above.best_score > p.best_score) AS rank
            FROM chair_stack_player p
            WHERE p.best_score > 0
            """;
    private final JdbcClient jdbc;
    private final ChairStackPlayerRepository players;

    public Ranking find(ChairStackOwner owner, String cursor, int size) {
        Cursor after = cursor == null ? null : Cursor.decode(cursor);
        var statement = jdbc.sql(SELECT + (after == null ? "" : """
                AND (p.best_score < :score OR (p.best_score = :score AND (p.best_at, p.id) > (:at, :id)))
                """) + " ORDER BY p.best_score DESC, p.best_at, p.id LIMIT :limit")
                .param("limit", size + 1);
        if (after != null) {
            statement.param("score", after.score()).param("at", after.at()).param("id", after.id());
        }
        var rows = statement.query(this::row).list();
        boolean more = rows.size() > size;
        var page = more ? rows.subList(0, size) : rows;
        Item me = players.find(owner).filter(player -> player.bestScore() > 0)
                .flatMap(player -> jdbc.sql(SELECT + " AND p.id = :player")
                        .param("player", player.id()).query(this::row).optional())
                .map(Row::item).orElse(null);
        return new Ranking(page.stream().map(Row::item).toList(), me,
                more ? page.getLast().cursor().encode() : null, more);
    }

    private Row row(ResultSet row, int rowNumber) throws SQLException {
        var item = new Item(row.getLong("rank"), row.getString("best_nickname"),
                row.getBoolean("guest"), row.getInt("best_score"));
        return new Row(item, new Cursor(item.score(), row.getObject("best_at", OffsetDateTime.class),
                row.getLong("id")));
    }

    public record Ranking(List<Item> items, Item me, String nextCursor, boolean hasNext) {
    }

    public record Item(long rank, String nickname, boolean guest, int score) {
    }

    private record Row(Item item, Cursor cursor) {
    }

    private record Cursor(int score, OffsetDateTime at, long id) {
        String encode() {
            String value = score + "," + at + "," + id;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
        }

        static Cursor decode(String cursor) {
            try {
                String[] fields = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split(",");
                if (fields.length != 3) {
                    throw new IllegalArgumentException();
                }
                return new Cursor(Integer.parseInt(fields[0]), OffsetDateTime.parse(fields[1]),
                        Long.parseLong(fields[2]));
            } catch (IllegalArgumentException | java.time.DateTimeException exception) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "랭킹 페이지를 다시 불러와 주세요.");
            }
        }
    }
}
