package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 현직자가 선택해서 남기는 회사 정보다. 공개 여부는 본인이 정한다.
 */
@Getter
@Embeddable
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Company {

    private static final int MAX_NAME_LENGTH = 50;

    @Column(name = "company_name", length = MAX_NAME_LENGTH)
    private String name;

    @Column(name = "company_visible")
    private boolean visible;

    private Company(String name, boolean visible) {
        this.name = validateName(name);
        this.visible = visible;
    }

    public static Company of(String name, boolean visible) {
        return new Company(name, visible);
    }

    private static String validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "회사명은 비어 있을 수 없습니다.");
        }
        String trimmed = name.strip();
        if (trimmed.length() > MAX_NAME_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "회사명은 50자 이하여야 합니다.");
        }
        return trimmed;
    }
}
