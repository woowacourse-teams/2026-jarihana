package com.project.jarihana.member.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
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

    @Column(name = "generation", nullable = false, updatable = false)
    private int generation;

    @Column(name = "github_id", nullable = false, length = 50)
    private String githubId;

    @Enumerated(EnumType.STRING)
    @Column(name = "course", nullable = false, length = 20)
    private Course course;

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    private Member(
            Long id,
            String crewName,
            int generation,
            String githubId,
            Course course,
            LocalDateTime withdrawnAt
    ) {
        this.id = id;
        this.crewName = validateCrewName(crewName);
        this.generation = validateGeneration(generation);
        this.githubId = validateGithubId(githubId);
        this.course = validateCourse(course);
        this.withdrawnAt = withdrawnAt;
    }

    private static String validateCrewName(String crewName) {
        if (crewName == null || !CREW_NAME_PATTERN.matcher(crewName).matches()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "크루명은 완성형 한글 2자부터 4자까지여야 합니다.");
        }
        return crewName;
    }

    private static int validateGeneration(int generation) {
        if (generation <= 0) {
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

    private static Course validateCourse(Course course) {
        if (course == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "코스는 필수입니다.");
        }
        return course;
    }

    public static Member create(String crewName, int generation, String githubId, Course course) {
        return new Member(null, crewName, generation, githubId, course, null);
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
