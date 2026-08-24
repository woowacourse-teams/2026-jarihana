package com.project.jarihana.recruitment.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentDetailProjection;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(TestSupportConfig.class)
@Transactional
class JpaRecruitmentDetailRepositoryTest {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupRecruitmentJpaRepository recruitmentJpaRepository;

    @Autowired
    private RegistrationJpaRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JpaRecruitmentDetailRepository repository;

    @DisplayName("모집 공고와 그룹, 승인 인원을 함께 조회한다.")
    @Test
    void findsRecruitmentDetailWithApprovedCount() {
        // Given
        Group group = saveGroup("저장소상세스터디");
        GroupRecruitment recruitment = recruitmentJpaRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.AUTO,
                3,
                NOW.minusHours(1),
                NOW.plusDays(1)
        ));
        Member firstMember = memberRepository.save(Member.create("가온", 8, "repository-detail-1", Course.BACKEND));
        Member secondMember = memberRepository.save(Member.create("마루", 8, "repository-detail-2", Course.FRONTEND));
        registrationRepository.save(Registration.createAutoApproved(
                recruitment,
                firstMember,
                null,
                NOW,
                0
        ));
        registrationRepository.save(Registration.createAutoApproved(
                recruitment,
                secondMember,
                null,
                NOW,
                1
        ));

        // When
        RecruitmentDetailProjection projection = repository
                .findByGroupIdAndRecruitmentId(group.getId(), recruitment.getId())
                .orElseThrow();

        // Then
        assertThat(projection.group().getName()).isEqualTo("저장소상세스터디");
        assertThat(projection.recruitment().getId()).isEqualTo(recruitment.getId());
        assertThat(projection.approvedCount()).isEqualTo(2);
    }

    private Group saveGroup(String name) {
        return groupRepository.save(Group.createStudy(
                name,
                "함께 학습합니다.",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.NOON,
                        LocalTime.of(13, 0)
                ),
                NOW
        ));
    }

    @DisplayName("다른 그룹의 모집 공고는 조회하지 않는다.")
    @Test
    void excludesRecruitmentFromAnotherGroup() {
        // Given
        Group ownerGroup = saveGroup("모집소유스터디");
        Group requestedGroup = saveGroup("요청그룹스터디");
        GroupRecruitment recruitment = recruitmentJpaRepository.save(GroupRecruitment.create(
                ownerGroup,
                JoinMethod.APPROVAL,
                3,
                NOW,
                null
        ));

        // When
        Optional<RecruitmentDetailProjection> projection = repository
                .findByGroupIdAndRecruitmentId(requestedGroup.getId(), recruitment.getId());

        // Then
        assertThat(projection).isEmpty();
    }
}
