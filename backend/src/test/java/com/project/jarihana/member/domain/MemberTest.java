package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
        assertThat(member.getMemberType()).isEqualTo(MemberType.CREW);
        assertThat(member.getCourse()).isEqualTo(Course.BACKEND);
        assertThat(member.getWithdrawnAt()).isNull();
    }

    @DisplayName("코치는 과정과 기수 없이 회원을 생성한다.")
    @Test
    void createCoach() {
        // When
        Member member = Member.create("코치", null, "123456", MemberType.COACH, null);

        // Then
        assertThat(member.getMemberType()).isEqualTo(MemberType.COACH);
        assertThat(member.getCourse()).isNull();
        assertThat(member.getGeneration()).isNull();
    }

    @DisplayName("크루명은 공백이나 특수문자 없이 완성형 한글 2자부터 4자까지만 허용한다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "가", "가나다라마", "우 주", "crew", "우주!", "ㅎㅎ"})
    void invalidCrewNameCannotCreateMember(String crewName) {
        // When & Then
        assertThatThrownBy(() -> Member.create(crewName, 8, "123456", Course.BACKEND))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("기수는 양수여야 한다.")
    @Test
    void generationMustBePositive() {
        // When & Then
        assertThatThrownBy(() -> Member.create("우주", 0, "123456", Course.BACKEND))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("GitHub ID는 비어 있을 수 없다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " "})
    void githubIdIsRequired(String githubId) {
        // When & Then
        assertThatThrownBy(() -> Member.create("우주", 8, githubId, Course.BACKEND))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("코스는 필수다.")
    @Test
    void courseIsRequired() {
        // When & Then
        assertThatThrownBy(() -> Member.create("우주", 8, "123456", null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("크루는 과정 없이 생성할 수 없다.")
    @Test
    void crewCourseIsRequired() {
        // When & Then
        assertThatThrownBy(() -> Member.create("우주", 8, "123456", MemberType.CREW, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("코치는 과정이나 기수를 가질 수 없다.")
    @Test
    void coachCannotHaveCourseOrGeneration() {
        // When & Then
        assertThatThrownBy(() -> Member.create("코치", 8, "123456", MemberType.COACH, Course.BACKEND))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("부트캠프 회원은 캠프 정보와 분야로 생성하고 과정, 기수, 연차, 회사는 갖지 않는다.")
    @Test
    void createBootcampMember() {
        // Given
        Bootcamp bootcamp = Bootcamp.of("SSAFY", BootcampStatus.IN_PROGRESS, "12기");

        // When
        Member member = Member.createBootcamp("도담", "123456", bootcamp, MemberField.BACKEND);

        // Then
        assertThat(member.getMemberType()).isEqualTo(MemberType.BOOTCAMP);
        assertThat(member.getBootcamp().getName()).isEqualTo("SSAFY");
        assertThat(member.getBootcamp().getStatus()).isEqualTo(BootcampStatus.IN_PROGRESS);
        assertThat(member.getBootcamp().getCohort()).isEqualTo("12기");
        assertThat(member.getField()).isEqualTo(MemberField.BACKEND);
        assertThat(member.getCourse()).isNull();
        assertThat(member.getGeneration()).isNull();
        assertThat(member.getCareer()).isNull();
        assertThat(member.getCompany()).isNull();
    }

    @DisplayName("부트캠프 회원은 캠프 정보 없이 생성할 수 없다.")
    @Test
    void bootcampMemberRequiresBootcamp() {
        // When & Then
        assertThatThrownBy(() -> Member.createBootcamp("도담", "123456", null, MemberField.BACKEND))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("부트캠프 회원은 분야 없이 생성할 수 없다.")
    @Test
    void bootcampMemberRequiresField() {
        // Given
        Bootcamp bootcamp = Bootcamp.of("SSAFY", BootcampStatus.COMPLETED, null);

        // When & Then
        assertThatThrownBy(() -> Member.createBootcamp("도담", "123456", bootcamp, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("회원 유형만 부트캠프나 현직자로 지정해서는 회원을 생성할 수 없다.")
    @ParameterizedTest
    @EnumSource(value = MemberType.class, names = {"BOOTCAMP", "PROFESSIONAL"})
    void affiliationTypeCannotBeCreatedWithoutAffiliation(MemberType memberType) {
        // When & Then
        assertThatThrownBy(() -> Member.create("도담", null, "123456", memberType, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("현직자는 직무와 연차로 생성하고 회사 정보는 선택이다.")
    @Test
    void createProfessionalMemberWithoutCompany() {
        // When
        Member member = Member.createProfessional("하나", "123456", MemberField.FRONTEND, Career.YEARS_1_3, null);

        // Then
        assertThat(member.getMemberType()).isEqualTo(MemberType.PROFESSIONAL);
        assertThat(member.getField()).isEqualTo(MemberField.FRONTEND);
        assertThat(member.getCareer()).isEqualTo(Career.YEARS_1_3);
        assertThat(member.getCompany()).isNull();
        assertThat(member.getBootcamp()).isNull();
        assertThat(member.getCourse()).isNull();
        assertThat(member.getGeneration()).isNull();
    }

    @DisplayName("현직자는 회사명과 공개 여부를 함께 저장할 수 있다.")
    @Test
    void createProfessionalMemberWithCompany() {
        // When
        Member member = Member.createProfessional(
                "하나", "123456", MemberField.DATA_AI, Career.YEARS_7_PLUS, Company.of("자리하나", false)
        );

        // Then
        assertThat(member.getCompany().getName()).isEqualTo("자리하나");
        assertThat(member.getCompany().isVisible()).isFalse();
    }

    @DisplayName("현직자는 직무와 연차가 필수다.")
    @Test
    void professionalMemberRequiresFieldAndCareer() {
        // When & Then
        assertThatThrownBy(() -> Member.createProfessional("하나", "123456", null, Career.UNDER_1, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> Member.createProfessional("하나", "123456", MemberField.DESIGN, null, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("기본 멤버는 닉네임과 GitHub ID만으로 생성하고 기수, 과정, 소속 정보를 갖지 않는다.")
    @Test
    void createBasicMember() {
        // When
        Member member = Member.createBasic("도담", "123456");

        // Then
        assertThat(member.getMemberType()).isEqualTo(MemberType.MEMBER);
        assertThat(member.getCrewName()).isEqualTo("도담");
        assertThat(member.getGithubId()).isEqualTo("123456");
        assertThat(member.getGeneration()).isNull();
        assertThat(member.getCourse()).isNull();
        assertThat(member.getBootcamp()).isNull();
        assertThat(member.getField()).isNull();
        assertThat(member.getCareer()).isNull();
        assertThat(member.getCompany()).isNull();
    }

    @DisplayName("기본 멤버는 기수나 과정을 가질 수 없다.")
    @Test
    void basicMemberCannotHaveGenerationOrCourse() {
        // When & Then
        assertThatThrownBy(() -> Member.create("도담", 8, "123456", MemberType.MEMBER, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
        assertThatThrownBy(() -> Member.create("도담", null, "123456", MemberType.MEMBER, Course.BACKEND))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("명단으로 인증한 기본 멤버는 닉네임을 유지한 채 명단의 기수와 과정을 가진 크루가 된다.")
    @Test
    void basicMemberBecomesCrewWithRosterGenerationAndCourse() {
        // Given
        Member member = Member.createBasic("도담", "123456");

        // When
        member.verifyCrew(8, Course.FRONTEND);

        // Then
        assertThat(member.getMemberType()).isEqualTo(MemberType.CREW);
        assertThat(member.getCrewName()).isEqualTo("도담");
        assertThat(member.getGeneration()).isEqualTo(8);
        assertThat(member.getCourse()).isEqualTo(Course.FRONTEND);
    }

    @DisplayName("명단으로 인증한 부트캠프 회원과 현직자는 소속 정보를 비우고 크루가 된다.")
    @Test
    void affiliationMemberDropsAffiliationWhenVerifiedAsCrew() {
        // Given
        Member bootcamp = Member.createBootcamp(
                "도담", "123456", Bootcamp.of("SSAFY", BootcampStatus.COMPLETED, "12기"), MemberField.BACKEND
        );
        Member professional = Member.createProfessional(
                "하나", "654321", MemberField.DATA_AI, Career.YEARS_1_3, Company.of("자리하나", true)
        );

        // When
        bootcamp.verifyCrew(8, Course.BACKEND);
        professional.verifyCrew(7, Course.ANDROID);

        // Then
        assertThat(bootcamp.getMemberType()).isEqualTo(MemberType.CREW);
        assertThat(bootcamp.getBootcamp()).isNull();
        assertThat(bootcamp.getField()).isNull();
        assertThat(professional.getMemberType()).isEqualTo(MemberType.CREW);
        assertThat(professional.getField()).isNull();
        assertThat(professional.getCareer()).isNull();
        assertThat(professional.getCompany()).isNull();
    }

    @DisplayName("크루와 코치는 명단 인증 대상이 아니다.")
    @Test
    void crewAndCoachAreNotCrewVerificationTargets() {
        // Given
        Member crew = Member.create("가온", 7, "123456", Course.BACKEND);
        Member coach = Member.create("코치", null, "654321", MemberType.COACH, null);

        // When & Then
        assertThat(crew.isCrewVerificationTarget()).isFalse();
        assertThat(coach.isCrewVerificationTarget()).isFalse();
        assertThat(Member.createBasic("도담", "111111").isCrewVerificationTarget()).isTrue();
        assertThatThrownBy(() -> crew.verifyCrew(8, Course.FRONTEND)).isInstanceOf(IllegalStateException.class);
        assertThat(crew.getGeneration()).isEqualTo(7);
    }

    @DisplayName("명단 인증에도 양수 기수와 과정이 필요하다.")
    @Test
    void crewVerificationRequiresGenerationAndCourse() {
        // Given
        Member member = Member.createBasic("도담", "123456");

        // When & Then
        assertThatThrownBy(() -> member.verifyCrew(0, Course.BACKEND)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> member.verifyCrew(8, null)).isInstanceOf(BusinessException.class);
        assertThat(member.getMemberType()).isEqualTo(MemberType.MEMBER);
    }
}
