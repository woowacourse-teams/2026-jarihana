package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * 부트캠프 회원이 다니는 캠프 정보다.
 *
 * <p>우아한테크코스는 부트캠프로 받지 않는다. 우테코 크루는 크루 인증을 거쳐 크루로 가입한다.
 */
@Getter
@Embeddable
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Bootcamp {

    private static final int MAX_NAME_LENGTH = 30;
    private static final int MAX_COHORT_LENGTH = 20;
    private static final Pattern WHITESPACE = Pattern.compile("\\s");
    private static final Set<String> WOOWAHAN_TECH_COURSE_NAMES = Set.of("우아한테크코스", "우테코");

    @Column(name = "bootcamp_name", length = MAX_NAME_LENGTH)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "bootcamp_status", length = 20)
    private BootcampStatus status;

    @Column(name = "bootcamp_cohort", length = MAX_COHORT_LENGTH)
    private String cohort;

    private Bootcamp(String name, BootcampStatus status, String cohort) {
        this.name = validateName(name);
        this.status = validateStatus(status);
        this.cohort = validateCohort(cohort);
    }

    public static Bootcamp of(String name, BootcampStatus status, String cohort) {
        return new Bootcamp(name, status, cohort);
    }

    private static String validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "부트캠프 이름은 필수입니다.");
        }
        String trimmed = name.strip();
        if (trimmed.length() > MAX_NAME_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "부트캠프 이름은 30자 이하여야 합니다.");
        }
        if (WOOWAHAN_TECH_COURSE_NAMES.contains(WHITESPACE.matcher(trimmed).replaceAll(""))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "우아한테크코스 크루는 크루 인증으로 가입합니다.");
        }
        return trimmed;
    }

    private static BootcampStatus validateStatus(BootcampStatus status) {
        if (status == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "수강 상태는 필수입니다.");
        }
        return status;
    }

    private static String validateCohort(String cohort) {
        if (cohort == null || cohort.isBlank()) {
            return null;
        }
        String trimmed = cohort.strip();
        if (trimmed.length() > MAX_COHORT_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "부트캠프 기수는 20자 이하여야 합니다.");
        }
        return trimmed;
    }
}
