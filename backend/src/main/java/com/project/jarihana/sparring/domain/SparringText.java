package com.project.jarihana.sparring.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

public final class SparringText {
    private SparringText() {}

    public static String required(String value, int maximum) {
        if (value == null || value.isBlank() || value.trim().length() > maximum) {
            throw new BusinessException(
                    ErrorCode.INVALID_PARAMETER, "내용을 1~" + maximum + "자로 적어주세요.");
        }
        return value.trim();
    }
}
