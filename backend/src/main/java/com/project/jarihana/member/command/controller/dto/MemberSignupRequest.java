package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.domain.BootcampStatus;
import com.project.jarihana.member.domain.Career;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberField;
import com.project.jarihana.member.domain.MemberType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 크루는 {@code generation}, {@code course}를, 부트캠프 회원은 {@code bootcamp}, {@code field}를,
 * 현직자는 {@code field}, {@code career}와 선택 {@code company}를 보낸다. 유형별 필수 여부는 도메인이 검증한다.
 */
public record MemberSignupRequest(
        @NotNull MemberType memberType,
        @NotBlank String crewName,
        @Positive Integer generation,
        Course course,
        BootcampRequest bootcamp,
        MemberField field,
        Career career,
        CompanyRequest company
) {

    public record BootcampRequest(String name, BootcampStatus status, String cohort) {
    }

    public record CompanyRequest(String name, Boolean visible) {
    }
}
