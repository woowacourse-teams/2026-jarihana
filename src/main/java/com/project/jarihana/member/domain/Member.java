package com.project.jarihana.member.domain;

import java.time.LocalDateTime;
import java.util.regex.Pattern;

public final class Member {

    private static final Pattern CREW_NAME_PATTERN = Pattern.compile("^[가-힣]{2,4}$");

    private final Long id;
    private final String crewName;
    private final int generation;
    private final String githubId;
    private final Course course;
    private final LocalDateTime withdrawnAt;

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

    public static Member create(String crewName, int generation, String githubId, Course course) {
        return new Member(null, crewName, generation, githubId, course, null);
    }

    private static String validateCrewName(String crewName) {
        if (crewName == null || !CREW_NAME_PATTERN.matcher(crewName).matches()) {
            throw new IllegalArgumentException("크루명은 완성형 한글 2자부터 4자까지여야 합니다.");
        }
        return crewName;
    }

    private static int validateGeneration(int generation) {
        if (generation <= 0) {
            throw new IllegalArgumentException("기수는 양수여야 합니다.");
        }
        return generation;
    }

    private static String validateGithubId(String githubId) {
        if (githubId == null || githubId.isBlank()) {
            throw new IllegalArgumentException("GitHub ID는 필수입니다.");
        }
        return githubId;
    }

    private static Course validateCourse(Course course) {
        if (course == null) {
            throw new IllegalArgumentException("코스는 필수입니다.");
        }
        return course;
    }

    public Long getId() {
        return id;
    }

    public String getCrewName() {
        return crewName;
    }

    public int getGeneration() {
        return generation;
    }

    public String getGithubId() {
        return githubId;
    }

    public Course getCourse() {
        return course;
    }

    public LocalDateTime getWithdrawnAt() {
        return withdrawnAt;
    }
}
