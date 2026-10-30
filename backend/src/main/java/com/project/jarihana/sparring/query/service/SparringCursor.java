package com.project.jarihana.sparring.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.LocalDateTime;
import java.util.Base64;

public record SparringCursor(LocalDateTime at, long id) {
    public static SparringCursor decode(String cursor) {
        if (cursor == null || cursor.isBlank()) return new SparringCursor(null, Long.MAX_VALUE);
        try {
            String[] parts =
                    new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
                            .split("~", -1);
            if (parts.length != 2) throw new IllegalArgumentException();
            long id = Long.parseLong(parts[1]);
            if (id <= 0) throw new IllegalArgumentException();
            return new SparringCursor(LocalDateTime.parse(parts[0]), id);
        } catch (IllegalArgumentException | DateTimeException exception) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "목록 위치가 올바르지 않아요.");
        }
    }

    public static String encode(LocalDateTime at, long id) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString((at + "~" + id).getBytes(StandardCharsets.UTF_8));
    }
}
