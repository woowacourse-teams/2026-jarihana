package com.project.jarihana.member.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class MemberTest {

    @DisplayName("필수 프로필을 입력하면 회원을 생성한다.")
    @Test
    void createMember() {
        // Given
        String crewName = "우주";

        // When
        Member member = Member.create(crewName, 8, "123456", Course.BACKEND);

        // Then
        assertThat(member.getCrewName()).isEqualTo(crewName);
        assertThat(member.getGeneration()).isEqualTo(8);
        assertThat(member.getGithubId()).isEqualTo("123456");
        assertThat(member.getCourse()).isEqualTo(Course.BACKEND);
        assertThat(member.getWithdrawnAt()).isNull();
    }

    @DisplayName("크루명은 공백이나 특수문자 없이 완성형 한글 2자부터 4자까지만 허용한다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "가", "가나다라마", "우 주", "crew", "우주!", "ㅎㅎ"})
    void invalidCrewNameCannotCreateMember(String crewName) {
        // When & Then
        assertThatThrownBy(() -> Member.create(crewName, 8, "123456", Course.BACKEND))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("기수는 양수여야 한다.")
    @Test
    void generationMustBePositive() {
        // When & Then
        assertThatThrownBy(() -> Member.create("우주", 0, "123456", Course.BACKEND))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("GitHub ID는 비어 있을 수 없다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " "})
    void githubIdIsRequired(String githubId) {
        // When & Then
        assertThatThrownBy(() -> Member.create("우주", 8, githubId, Course.BACKEND))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("코스는 필수다.")
    @Test
    void courseIsRequired() {
        // When & Then
        assertThatThrownBy(() -> Member.create("우주", 8, "123456", null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
