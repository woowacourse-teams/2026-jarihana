package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.command.service.dto.MemberSignupResult;
import com.project.jarihana.member.domain.Bootcamp;
import com.project.jarihana.member.domain.BootcampStatus;
import com.project.jarihana.member.domain.Career;
import com.project.jarihana.member.domain.Company;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberField;
import com.project.jarihana.member.domain.MemberType;

import java.time.LocalDateTime;

public record MemberSignupResponse(
        Long id,
        String crewName,
        Integer generation,
        MemberType memberType,
        Course course,
        BootcampResponse bootcamp,
        MemberField field,
        Career career,
        CompanyResponse company,
        LocalDateTime joinedAt
) {

    public static MemberSignupResponse from(MemberSignupResult result) {
        return new MemberSignupResponse(
                result.id(),
                result.crewName(),
                result.generation(),
                result.memberType(),
                result.course(),
                BootcampResponse.from(result.bootcamp()),
                result.field(),
                result.career(),
                CompanyResponse.from(result.company()),
                result.joinedAt()
        );
    }

    public record BootcampResponse(String name, BootcampStatus status, String cohort) {

        private static BootcampResponse from(Bootcamp bootcamp) {
            if (bootcamp == null) {
                return null;
            }
            return new BootcampResponse(bootcamp.getName(), bootcamp.getStatus(), bootcamp.getCohort());
        }
    }

    public record CompanyResponse(String name, boolean visible) {

        private static CompanyResponse from(Company company) {
            if (company == null) {
                return null;
            }
            return new CompanyResponse(company.getName(), company.isVisible());
        }
    }
}
