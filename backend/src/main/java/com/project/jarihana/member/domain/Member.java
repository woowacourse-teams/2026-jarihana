package com.project.jarihana.member.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.regex.Pattern;

@Getter
@Entity
@Table(
        name = "member",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_member_github_id", columnNames = "github_id"),
                @UniqueConstraint(name = "uk_member_crew_name_generation", columnNames = {"crew_name", "generation"})
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member extends BaseEntity {

    private static final Pattern CREW_NAME_PATTERN = Pattern.compile("^[가-힣]{2,4}$");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "crew_name", nullable = false, length = 4)
    private String crewName;

    @Column(name = "generation", updatable = false)
    private Integer generation;

    @Enumerated(EnumType.STRING)
    @Column(name = "member_type", nullable = false, length = 20)
    private MemberType memberType;

    @Column(name = "github_id", nullable = false, length = 50)
    private String githubId;

    @Enumerated(EnumType.STRING)
    @Column(name = "course", length = 20)
    private Course course;

    @Embedded
    private Bootcamp bootcamp;

    @Enumerated(EnumType.STRING)
    @Column(name = "field", length = 20)
    private MemberField field;

    @Enumerated(EnumType.STRING)
    @Column(name = "career", length = 20)
    private Career career;

    @Embedded
    private Company company;

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    private Member(
            Long id,
            String crewName,
            Integer generation,
            String githubId,
            MemberType memberType,
            Course course,
            Affiliation affiliation,
            LocalDateTime withdrawnAt
    ) {
        this.id = id;
        this.crewName = validateCrewName(crewName);
        this.memberType = validateMemberType(memberType);
        this.course = validateCourse(course, this.memberType);
        this.generation = validateGeneration(generation, this.memberType);
        this.bootcamp = validateBootcamp(affiliation.bootcamp(), this.memberType);
        this.field = validateField(affiliation.field(), this.memberType);
        this.career = validateCareer(affiliation.career(), this.memberType);
        this.company = validateCompany(affiliation.company(), this.memberType);
        this.githubId = validateGithubId(githubId);
        this.withdrawnAt = withdrawnAt;
    }

    private static String validateCrewName(String crewName) {
        if (crewName == null || !CREW_NAME_PATTERN.matcher(crewName).matches()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "크루명은 완성형 한글 2자부터 4자까지여야 합니다.");
        }
        return crewName;
    }

    private static Integer validateGeneration(Integer generation, MemberType memberType) {
        if (memberType != MemberType.CREW && generation != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "기수는 크루만 입력합니다.");
        }
        if (memberType == MemberType.CREW && (generation == null || generation <= 0)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "기수는 양수여야 합니다.");
        }
        return generation;
    }

    private static Bootcamp validateBootcamp(Bootcamp bootcamp, MemberType memberType) {
        if (memberType == MemberType.BOOTCAMP && bootcamp == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "부트캠프 정보는 필수입니다.");
        }
        if (memberType != MemberType.BOOTCAMP && bootcamp != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "부트캠프 정보는 부트캠프 회원만 입력합니다.");
        }
        return bootcamp;
    }

    private static MemberField validateField(MemberField field, MemberType memberType) {
        boolean required = memberType == MemberType.BOOTCAMP || memberType == MemberType.PROFESSIONAL;
        if (required && field == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "분야는 필수입니다.");
        }
        if (!required && field != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "분야는 부트캠프 회원과 현직자만 입력합니다.");
        }
        return field;
    }

    private static Career validateCareer(Career career, MemberType memberType) {
        if (memberType == MemberType.PROFESSIONAL && career == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "연차는 필수입니다.");
        }
        if (memberType != MemberType.PROFESSIONAL && career != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "연차는 현직자만 입력합니다.");
        }
        return career;
    }

    private static Company validateCompany(Company company, MemberType memberType) {
        if (memberType != MemberType.PROFESSIONAL && company != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "회사 정보는 현직자만 입력합니다.");
        }
        return company;
    }

    private static String validateGithubId(String githubId) {
        if (githubId == null || githubId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "GitHub ID는 필수입니다.");
        }
        return githubId;
    }

    private static MemberType validateMemberType(MemberType memberType) {
        if (memberType == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "회원 유형은 필수입니다.");
        }
        return memberType;
    }

    private static Course validateCourse(Course course, MemberType memberType) {
        if (memberType != MemberType.CREW && course != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "과정은 크루만 입력합니다.");
        }
        if (memberType == MemberType.CREW && course == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "코스는 필수입니다.");
        }
        return course;
    }

    public static Member create(String crewName, Integer generation, String githubId, Course course) {
        return create(crewName, generation, githubId, MemberType.CREW, course);
    }

    public static Member create(
            String crewName,
            Integer generation,
            String githubId,
            MemberType memberType,
            Course course
    ) {
        return new Member(null, crewName, generation, githubId, memberType, course, Affiliation.NONE, null);
    }

    public static Member createBootcamp(String crewName, String githubId, Bootcamp bootcamp, MemberField field) {
        Affiliation affiliation = new Affiliation(bootcamp, field, null, null);
        return new Member(null, crewName, null, githubId, MemberType.BOOTCAMP, null, affiliation, null);
    }

    public static Member createProfessional(
            String crewName,
            String githubId,
            MemberField field,
            Career career,
            Company company
    ) {
        Affiliation affiliation = new Affiliation(null, field, career, company);
        return new Member(null, crewName, null, githubId, MemberType.PROFESSIONAL, null, affiliation, null);
    }

    public LocalDateTime getJoinedAt() {
        return getCreatedAt();
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof Member other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }

    /**
     * 크루와 코치가 아닌 회원의 소속 정보를 생성자에 한 번에 넘기기 위한 묶음이다.
     */
    private record Affiliation(Bootcamp bootcamp, MemberField field, Career career, Company company) {

        private static final Affiliation NONE = new Affiliation(null, null, null, null);
    }
}
