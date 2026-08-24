package com.project.jarihana.registration.query.repository;

import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListProjection;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListSearchCriteria;
import com.project.jarihana.registration.query.repository.dto.RegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.RegistrationListProjection;
import com.project.jarihana.registration.query.repository.dto.RegistrationListSearchCriteria;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class JpaRegistrationListRepository implements RegistrationListRepository {

    private final GroupRecruitmentJpaRepository recruitmentRepository;
    private final RegistrationAccessJpaRepository accessRepository;
    private final RegistrationListJpaRepository registrationRepository;

    public JpaRegistrationListRepository(
            GroupRecruitmentJpaRepository recruitmentRepository,
            RegistrationAccessJpaRepository accessRepository,
            RegistrationListJpaRepository registrationRepository
    ) {
        this.recruitmentRepository = recruitmentRepository;
        this.accessRepository = accessRepository;
        this.registrationRepository = registrationRepository;
    }

    @Override
    public Optional<Long> findGroupIdByRecruitmentId(Long recruitmentId) {
        return recruitmentRepository.findById(recruitmentId)
                .map(GroupRecruitment::getGroup)
                .map(group -> group.getId());
    }

    @Override
    public boolean existsLeaderByGroupIdAndMemberId(Long groupId, Long memberId) {
        return accessRepository.existsByGroupIdAndMemberIdAndRole(
                groupId,
                memberId,
                GroupMemberRole.LEADER
        );
    }

    @Override
    public RegistrationListPage findPage(RegistrationListSearchCriteria criteria, int size) {
        Slice<Registration> registrations = registrationRepository.findPage(
                criteria.recruitmentId(),
                criteria.status(),
                criteria.cursorRegisteredAt(),
                criteria.cursorId(),
                Pageable.ofSize(size)
        );
        List<RegistrationListProjection> projections = registrations.getContent().stream()
                .map(JpaRegistrationListRepository::toProjection)
                .toList();
        return new RegistrationListPage(projections, registrations.hasNext());
    }

    @Override
    public MyRegistrationListPage findMyPage(MyRegistrationListSearchCriteria criteria, int size) {
        Slice<Registration> registrations = registrationRepository.findMyPage(
                criteria.memberId(),
                criteria.status(),
                criteria.cursorRegisteredAt(),
                criteria.cursorId(),
                Pageable.ofSize(size)
        );
        List<MyRegistrationListProjection> projections = registrations.getContent().stream()
                .map(JpaRegistrationListRepository::toMyProjection)
                .toList();
        return new MyRegistrationListPage(projections, registrations.hasNext());
    }

    private static MyRegistrationListProjection toMyProjection(Registration registration) {
        return new MyRegistrationListProjection(
                registration.getId(),
                registration.getRecruitment().getGroup().getId(),
                registration.getRecruitment().getGroup().getName(),
                registration.getRecruitment().getId(),
                registration.getMessage(),
                registration.getStatus(),
                registration.getRegisteredAt(),
                registration.getRejectReason(),
                registration.getDecidedAt(),
                registration.getDecidedBy() == null ? null : registration.getDecidedBy().getType(),
                registration.getDecidedBy() == null ? null : registration.getDecidedBy().getMemberId()
        );
    }

    private static RegistrationListProjection toProjection(Registration registration) {
        return new RegistrationListProjection(
                registration.getId(),
                registration.getMember().getId(),
                registration.getMember().getCrewName(),
                registration.getMember().getGeneration(),
                registration.getMember().getCourse(),
                registration.getMessage(),
                registration.getStatus(),
                registration.getRegisteredAt(),
                registration.getRejectReason(),
                registration.getDecidedAt(),
                registration.getDecidedBy() == null ? null : registration.getDecidedBy().getType(),
                registration.getDecidedBy() == null ? null : registration.getDecidedBy().getMemberId()
        );
    }
}
