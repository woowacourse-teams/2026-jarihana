package com.project.jarihana.gomoku.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GomokuBoardTest {
    private GomokuBoard board(int[][] black, int[][] white) {
        char[] cells = "0".repeat(225).toCharArray();
        for (int[] point : black) cells[point[1] * 15 + point[0]] = '1';
        for (int[] point : white) cells[point[1] * 15 + point[0]] = '2';
        return GomokuBoard.from(new String(cells));
    }

    @Test
    @DisplayName("네 방향에서 다섯 돌 연결을 판정한다")
    void winsInEveryDirection() {
        // Given
        for (int[] direction : new int[][] {{1, 0}, {0, 1}, {1, 1}, {1, -1}}) {
            int[][] points = new int[4][2];
            for (int i = 0; i < 4; i++)
                points[i] = new int[] {2 + i * direction[0], 8 + i * direction[1]};
            // When
            var result =
                    board(points, new int[0][])
                            .place(
                                    2 + 4 * direction[0],
                                    8 + 4 * direction[1],
                                    Stone.BLACK,
                                    GomokuRule.RENJU);
            // Then
            assertEquals(true, result.won());
        }
    }

    @Test
    @DisplayName("렌주 흑의 쌍3을 거부하고 자유룰에서는 허용한다")
    void rejectsDoubleThreeOnlyInRenju() {
        // Given
        var board = board(new int[][] {{6, 7}, {8, 7}, {7, 6}, {7, 8}}, new int[0][]);
        // When / Then
        assertThrows(
                BusinessException.class, () -> board.place(7, 7, Stone.BLACK, GomokuRule.RENJU));
        assertEquals(false, board.place(7, 7, Stone.BLACK, GomokuRule.FREESTYLE).won());
        assertEquals('0', board.encoded().charAt(112));
    }

    @Test
    @DisplayName("막힌 삼은 쌍3으로 세지 않는다")
    void ignoresBlockedThree() {
        // Given
        var board =
                board(new int[][] {{6, 7}, {8, 7}, {7, 6}, {7, 8}}, new int[][] {{4, 7}, {10, 7}});
        // When / Then
        assertEquals(false, board.place(7, 7, Stone.BLACK, GomokuRule.RENJU).won());
    }

    @Test
    @DisplayName("렌주 흑의 장목을 거부하며 백과 자유룰 장목은 승리다")
    void handlesOverlineByRuleAndColor() {
        // Given
        int[][] five = {{2, 7}, {3, 7}, {4, 7}, {6, 7}, {7, 7}};
        // When / Then
        assertThrows(
                BusinessException.class,
                () -> board(five, new int[0][]).place(5, 7, Stone.BLACK, GomokuRule.RENJU));
        assertEquals(
                true,
                board(five, new int[0][]).place(5, 7, Stone.BLACK, GomokuRule.FREESTYLE).won());
        assertEquals(
                true, board(new int[0][], five).place(5, 7, Stone.WHITE, GomokuRule.RENJU).won());
    }

    @Test
    @DisplayName("쌍4를 거부하고 정확한 오목 완성을 우선한다")
    void rejectsDoubleFourButPrioritizesFive() {
        // Given
        var board =
                board(new int[][] {{5, 7}, {6, 7}, {8, 7}, {7, 5}, {7, 6}, {7, 8}}, new int[0][]);
        // When / Then
        assertThrows(
                BusinessException.class, () -> board.place(7, 7, Stone.BLACK, GomokuRule.RENJU));
        var winning =
                board(
                        new int[][] {
                            {3, 7}, {4, 7}, {5, 7}, {6, 7}, {7, 6}, {7, 8}, {6, 6}, {8, 8}
                        },
                        new int[0][]);
        assertEquals(true, winning.place(7, 7, Stone.BLACK, GomokuRule.RENJU).won());
    }

    @Test
    @DisplayName("판 밖과 이미 놓인 자리를 거부한다")
    void rejectsInvalidPosition() {
        // Given
        var board = GomokuBoard.empty();
        var occupied = board.place(0, 0, Stone.BLACK, GomokuRule.FREESTYLE).board();
        // When / Then
        var outside = assertThrows(
                BusinessException.class,
                () -> board.place(-1, 0, Stone.BLACK, GomokuRule.FREESTYLE));
        var conflict = assertThrows(
                BusinessException.class,
                () -> occupied.place(0, 0, Stone.WHITE, GomokuRule.FREESTYLE));
        assertEquals(ErrorCode.INVALID_PARAMETER, outside.getErrorCode());
        assertEquals(ErrorCode.GOMOKU_CONFLICT, conflict.getErrorCode());
    }

    @Test
    @DisplayName("정확한 오목은 다른 방향의 장목보다 우선한다")
    void exactFiveTakesPriorityOverCrossingOverline() {
        // Given
        var board =
                board(
                        new int[][] {
                            {3, 7}, {4, 7}, {5, 7}, {6, 7}, {7, 4}, {7, 5}, {7, 6}, {7, 8}, {7, 9}
                        },
                        new int[0][]);

        // When
        var result = board.place(7, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(true, result.won());
        assertEquals('0', board.encoded().charAt(112));
    }

    @Test
    @DisplayName("한 방향에서 서로 다른 네 돌 집합을 만드는 쌍4도 금수다")
    void rejectsTwoDistinctFoursInTheSameDirection() {
        // Given
        var board = board(new int[][] {{4, 7}, {6, 7}, {8, 7}, {10, 7}}, new int[0][]);

        // When
        var exception =
                assertThrows(
                        BusinessException.class,
                        () -> board.place(7, 7, Stone.BLACK, GomokuRule.RENJU));

        // Then
        assertEquals(ErrorCode.GOMOKU_FORBIDDEN_MOVE, exception.getErrorCode());
    }

    @Test
    @DisplayName("양끝에서 오목을 만들 수 있는 하나의 열린 사는 쌍4가 아니다")
    void countsBothWinningEndpointsAsOneFour() {
        // Given
        var board = board(new int[][] {{5, 7}, {6, 7}, {8, 7}}, new int[0][]);

        // When
        var result = board.place(7, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(false, result.won());
        assertEquals(true, result.board().place(4, 7, Stone.BLACK, GomokuRule.RENJU).won());
        assertEquals(true, result.board().place(9, 7, Stone.BLACK, GomokuRule.RENJU).won());
    }

    @Test
    @DisplayName("판 가장자리에 붙어 열린 사로 늘릴 수 없는 삼은 쌍3으로 세지 않는다")
    void ignoresThreeWhoseStraightFourWouldTouchTheEdge() {
        // Given
        var board = board(new int[][] {{0, 7}, {2, 7}, {1, 6}, {1, 8}}, new int[0][]);

        // When
        var result = board.place(1, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(false, result.won());
    }

    @Test
    @DisplayName("열린 사의 한쪽 완성이 장목이면 진짜 삼이 아니다")
    void ignoresThreeWhoseFourHasAnOverlineEndpoint() {
        // Given
        var board =
                board(new int[][] {{3, 7}, {6, 7}, {8, 7}, {11, 7}, {7, 6}, {7, 8}}, new int[0][]);

        // When
        var result = board.place(7, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(false, result.won());
    }

    @Test
    @DisplayName("다른 열린 사 확장이 가능하면 한 확장이 장목에 막혀도 진짜 삼이다")
    void countsThreeWithOneValidStraightFourContinuation() {
        // Given
        var board = board(new int[][] {{3, 7}, {6, 7}, {8, 7}, {7, 6}, {7, 8}}, new int[0][]);

        // When
        var exception =
                assertThrows(
                        BusinessException.class,
                        () -> board.place(7, 7, Stone.BLACK, GomokuRule.RENJU));

        // Then
        assertEquals(ErrorCode.GOMOKU_FORBIDDEN_MOVE, exception.getErrorCode());
    }

    @Test
    @DisplayName("사로 늘리는 수가 다른 방향에서 오목을 완성하면 삼으로 세지 않는다")
    void ignoresThreeWhoseContinuationAlreadyWins() {
        // Given
        var board =
                board(
                        new int[][] {
                            {5, 7}, {8, 7}, {7, 6}, {7, 8},
                            {6, 3}, {6, 4}, {6, 5}, {6, 6}
                        },
                        new int[0][]);

        // When
        var result = board.place(7, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(false, result.won());
        assertEquals(true, result.board().place(6, 7, Stone.BLACK, GomokuRule.RENJU).won());
    }

    @Test
    @DisplayName("사로 늘리는 유일한 수가 장목이면 삼으로 세지 않는다")
    void ignoresThreeWhoseOnlyContinuationIsAnOverline() {
        // Given
        var board =
                board(
                        new int[][] {
                            {5, 7}, {8, 7}, {7, 6}, {7, 8}, {6, 2}, {6, 3}, {6, 4}, {6, 5}, {6, 6}
                        },
                        new int[0][]);

        // When
        var result = board.place(7, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(false, result.won());
        assertThrows(
                BusinessException.class,
                () -> result.board().place(6, 7, Stone.BLACK, GomokuRule.RENJU));
    }

    @Test
    @DisplayName("사로 늘리는 유일한 수가 쌍4이면 삼으로 세지 않는다")
    void ignoresThreeWhoseOnlyContinuationIsADoubleFour() {
        // Given
        var board =
                board(
                        new int[][] {{5, 7}, {8, 7}, {7, 6}, {7, 8}, {6, 5}, {6, 6}, {6, 8}},
                        new int[0][]);

        // When
        var result = board.place(7, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(false, result.won());
        assertThrows(
                BusinessException.class,
                () -> result.board().place(6, 7, Stone.BLACK, GomokuRule.RENJU));
    }

    @Test
    @DisplayName("사로 늘리는 유일한 수가 진짜 쌍3이면 원래 삼으로 세지 않는다")
    void ignoresThreeWhoseOnlyContinuationIsARealDoubleThree() {
        // Given
        var board =
                board(
                        new int[][] {{5, 7}, {8, 7}, {7, 6}, {7, 8}, {6, 6}, {6, 8}, {5, 6}},
                        new int[0][]);

        // When
        var result = board.place(7, 7, Stone.BLACK, GomokuRule.RENJU);

        // Then
        assertEquals(false, result.won());
        assertThrows(
                BusinessException.class,
                () -> result.board().place(6, 7, Stone.BLACK, GomokuRule.RENJU));
    }

    @Test
    @DisplayName("후속 쌍3의 삼이 장목 때문에 가짜이면 원래 쌍3은 금수다")
    void rejectsDoubleThreeWhenItsContinuationOnlyAppearsForbidden() {
        // Given
        var board =
                board(
                        new int[][] {
                            {5, 7}, {8, 7}, {7, 6}, {7, 8}, {6, 6}, {6, 8}, {5, 6}, {4, 0}, {4, 1},
                            {4, 2}, {4, 3}, {4, 4}, {8, 10}, {8, 11}, {8, 12}, {8, 13}, {8, 14}
                        },
                        new int[0][]);

        // When
        var exception =
                assertThrows(
                        BusinessException.class,
                        () -> board.place(7, 7, Stone.BLACK, GomokuRule.RENJU));

        // Then
        assertEquals(ErrorCode.GOMOKU_FORBIDDEN_MOVE, exception.getErrorCode());
    }
}
