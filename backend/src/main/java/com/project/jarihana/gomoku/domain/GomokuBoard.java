package com.project.jarihana.gomoku.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

public final class GomokuBoard {
    public static final int SIZE = 15;
    private static final int[][] DIRECTIONS = {{1, 0}, {0, 1}, {1, 1}, {1, -1}};
    private final String encoded;

    private GomokuBoard(String encoded) {
        if (encoded == null || !encoded.matches("[012]{225}"))
            throw new IllegalArgumentException("Invalid board");
        this.encoded = encoded;
    }

    public static GomokuBoard empty() {
        return new GomokuBoard("0".repeat(SIZE * SIZE));
    }

    public static GomokuBoard from(String encoded) {
        return new GomokuBoard(encoded);
    }

    public String encoded() {
        return encoded;
    }

    public Placement place(int x, int y, Stone stone, GomokuRule rule) {
        if (!inside(x, y)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "돌을 놓을 수 없는 위치예요.");
        }
        if (encoded.charAt(y * SIZE + x) != '0') {
            throw new BusinessException(ErrorCode.GOMOKU_CONFLICT, "이미 돌이 놓인 자리예요.");
        }
        char[] cells = encoded.toCharArray();
        cells[y * SIZE + x] = stone.cell();
        boolean five = hasLine(cells, x, y, stone.cell(), 5, true);
        if (rule == GomokuRule.RENJU
                && stone == Stone.BLACK
                && forbidden(cells, x, y, new HashMap<>())) {
            throw new BusinessException(
                    ErrorCode.GOMOKU_FORBIDDEN_MOVE, "흑은 쌍3, 쌍4, 장목 자리에 놓을 수 없어요.");
        }
        boolean won =
                rule == GomokuRule.RENJU && stone == Stone.BLACK
                        ? five
                        : hasLine(cells, x, y, stone.cell(), 5, false);
        String next = new String(cells);
        return new Placement(from(next), won, next.indexOf('0') < 0);
    }

    private static boolean forbidden(char[] cells, int x, int y, Map<String, Boolean> memo) {
        String key = new String(cells) + ":" + x + ":" + y;
        Boolean cached = memo.get(key);
        if (cached != null) return cached;
        boolean result;
        if (hasLine(cells, x, y, '1', 5, true)) result = false;
        else if (hasLine(cells, x, y, '1', 6, false) || fours(cells, x, y).size() >= 2)
            result = true;
        else result = threes(cells, x, y, memo).size() >= 2;
        memo.put(key, result);
        return result;
    }

    private static Set<String> fours(char[] cells, int x, int y) {
        Set<String> groups = new HashSet<>();
        for (int[] d : DIRECTIONS) {
            for (int start = -4; start <= 0; start++) {
                int[] stones = new int[4];
                int count = 0, gap = -1;
                boolean valid = true;
                for (int i = 0; i < 5; i++) {
                    int px = x + (start + i) * d[0], py = y + (start + i) * d[1];
                    if (!inside(px, py)) {
                        valid = false;
                        break;
                    }
                    int index = py * SIZE + px;
                    if (cells[index] == '1' && count < 4) stones[count++] = index;
                    else if (cells[index] == '0' && gap < 0) gap = index;
                    else {
                        valid = false;
                        break;
                    }
                }
                if (!valid || count != 4 || gap < 0) continue;
                cells[gap] = '1';
                if (line(cells, gap % SIZE, gap / SIZE, d, '1') == 5) groups.add(groupKey(stones));
                cells[gap] = '0';
            }
        }
        return groups;
    }

    private static Set<String> threes(char[] cells, int x, int y, Map<String, Boolean> memo) {
        Set<String> groups = new HashSet<>();
        for (int[] d : DIRECTIONS) {
            for (int start = -3; start <= 0; start++) {
                int beforeX = x + (start - 1) * d[0], beforeY = y + (start - 1) * d[1];
                int afterX = x + (start + 4) * d[0], afterY = y + (start + 4) * d[1];
                if (!empty(cells, beforeX, beforeY) || !empty(cells, afterX, afterY)) continue;
                int[] stones = new int[3];
                int count = 0, gap = -1;
                boolean valid = true;
                for (int i = 0; i < 4; i++) {
                    int index = (y + (start + i) * d[1]) * SIZE + x + (start + i) * d[0];
                    if (cells[index] == '1' && count < 3) stones[count++] = index;
                    else if (cells[index] == '0' && gap < 0) gap = index;
                    else {
                        valid = false;
                        break;
                    }
                }
                if (!valid || count != 3 || gap < 0) continue;
                cells[gap] = '1';
                // A three counts only when it can become an open four through a legal black move.
                if (!hasLine(cells, gap % SIZE, gap / SIZE, '1', 5, true)
                        && completesFive(cells, beforeX, beforeY, d)
                        && completesFive(cells, afterX, afterY, d)
                        && !forbidden(cells, gap % SIZE, gap / SIZE, memo))
                    groups.add(groupKey(stones));
                cells[gap] = '0';
                if (groups.size() >= 2) return groups;
            }
        }
        return groups;
    }

    private static String groupKey(int[] stones) {
        return Arrays.stream(stones)
                .sorted()
                .mapToObj(Integer::toString)
                .collect(Collectors.joining(","));
    }

    private static boolean completesFive(char[] cells, int x, int y, int[] direction) {
        cells[y * SIZE + x] = '1';
        boolean five = line(cells, x, y, direction, '1') == 5;
        cells[y * SIZE + x] = '0';
        return five;
    }

    private static boolean hasLine(
            char[] cells, int x, int y, char stone, int length, boolean exact) {
        for (int[] d : DIRECTIONS) {
            int count = line(cells, x, y, d, stone);
            if (exact ? count == length : count >= length) return true;
        }
        return false;
    }

    private static int line(char[] cells, int x, int y, int[] d, char stone) {
        int count = 1;
        for (int sign : new int[] {-1, 1}) {
            int px = x + sign * d[0], py = y + sign * d[1];
            while (inside(px, py) && cells[py * SIZE + px] == stone) {
                count++;
                px += sign * d[0];
                py += sign * d[1];
            }
        }
        return count;
    }

    private static boolean empty(char[] cells, int x, int y) {
        return inside(x, y) && cells[y * SIZE + x] == '0';
    }

    private static boolean inside(int x, int y) {
        return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
    }

    public record Placement(GomokuBoard board, boolean won, boolean full) {}
}
