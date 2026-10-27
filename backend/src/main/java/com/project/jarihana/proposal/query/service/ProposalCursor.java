package com.project.jarihana.proposal.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;

/**
 * 작성 시각과 ID를 불투명 문자열로 바꾼 목록 커서다.
 */
record ProposalCursor(LocalDateTime createdAt, long id) {

    static String encode(LocalDateTime createdAt, long id) {
        String value = createdAt + "|" + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    static ProposalCursor decode(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] values = decoded.split("\\|", -1);
            if (values.length != 2) {
                throw invalidParameter();
            }
            long id = Long.parseLong(values[1]);
            if (id < 1) {
                throw invalidParameter();
            }
            return new ProposalCursor(LocalDateTime.parse(values[0]), id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalidParameter();
        }
    }

    static BusinessException invalidParameter() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }
}
