package com.project.jarihana.common.pagination;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 커서가 없는 첫 페이지에 넘기는 끝값이다.
 * 목록 쿼리는 {@code (정렬 값, id) < (커서 값, 커서 id)} 같은 row-value 비교 하나로 다음 페이지를 고른다.
 * 첫 페이지에도 null 대신 모든 행을 통과시키는 끝값을 넘겨, 쿼리에 "커서가 없으면" 분기를 두지 않는다.
 * 분기가 없어야 PostgreSQL이 커서 조건을 인덱스 범위 조건으로 쓰고, Hibernate도 튜플 안의 null 파라미터 타입을
 * 추론하지 못해 bytea로 바인딩하는 문제를 피한다.
 */
public final class CursorBounds {

    /** 내림차순 목록의 첫 페이지 시각이다. */
    public static final LocalDateTime LATEST_TIME = LocalDateTime.of(9999, 12, 31, 23, 59, 59);

    /** 내림차순 목록의 첫 페이지 날짜다. */
    public static final LocalDate LATEST_DATE = LocalDate.of(9999, 12, 31);

    /** 내림차순 목록의 첫 페이지 식별자다. */
    public static final long LAST_ID = Long.MAX_VALUE;

    /** 오름차순 목록의 첫 페이지 시각이다. 서비스가 저장하는 어떤 시각보다 이르다. */
    public static final LocalDateTime EARLIEST_TIME = LocalDateTime.of(1970, 1, 1, 0, 0);

    /** 오름차순 목록의 첫 페이지 식별자다. */
    public static final long FIRST_ID = 0L;

    private CursorBounds() {
    }
}
