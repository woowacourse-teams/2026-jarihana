package com.project.jarihana.invitation.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;

record InvitationCursor(LocalDateTime createdAt, long id) {

    static String encode(String scope, LocalDateTime createdAt, long id) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
                ("1|" + scope + "|" + createdAt + "|" + id).getBytes(StandardCharsets.UTF_8));
    }

    static InvitationCursor decode(String value, String scope) {
        if (value == null) return null;
        if (value.isBlank() || value.length() > 512) throw invalid();
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", -1);
            if (parts.length != 4 || !parts[0].equals("1") || !parts[1].equals(scope)) throw invalid();
            LocalDateTime time = LocalDateTime.parse(parts[2]);
            long id = Long.parseLong(parts[3]);
            if (id <= 0 || time.getYear() < 1 || time.getYear() > 9999) throw invalid();
            return new InvitationCursor(time, id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalid();
        }
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "초대 목록 커서가 올바르지 않습니다.");
    }
}
