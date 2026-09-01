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

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    private Member(
            Long id,
            String crewName,
            Integer generation,
            String githubId,
            MemberType memberType,
            Course course,
            LocalDateTime withdrawnAt
    ) {
        this.id = id;
        this.crewName = validateCrewName(crewName);
        this.memberType = validateMemberType(memberType);
        this.course = validateCourse(course, this.memberType);
        this.generation = validateGeneration(generation, this.memberType);
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
        if (memberType == MemberType.COACH && generation != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "코치는 기수를 입력하지 않습니다.");
        }
        if (memberType == MemberType.CREW && (generation == null || generation <= 0)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "기수는 양수여야 합니다.");
        }
        return generation;
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
        if (memberType == MemberType.COACH && course != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "코치는 과정을 입력하지 않습니다.");
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
        return new Member(null, crewName, generation, githubId, memberType, course, null);
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
}
