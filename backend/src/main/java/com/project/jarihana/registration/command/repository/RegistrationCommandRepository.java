package com.project.jarihana.registration.command.repository;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.Repository;

public interface RegistrationCommandRepository extends Repository<Registration, Long> {

    void deleteAllByRecruitmentGroupId(long groupId);

    List<Registration> findAllByRecruitmentGroupIdAndStatus(long groupId, RegistrationStatus status);

    List<Registration> findAllByRecruitmentIdInAndStatus(
            List<Long> recruitmentIds,
            RegistrationStatus status
    );

    long countByRecruitmentIdAndStatus(long recruitmentId, RegistrationStatus status);

    boolean existsByRecruitmentIdAndMemberId(long recruitmentId, long memberId);

    boolean existsByRecruitmentGroupIdAndMemberIdAndStatus(
            long groupId,
            long memberId,
            RegistrationStatus status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Registration> findWithLockByIdAndRecruitmentId(long id, long recruitmentId);

    void delete(Registration registration);

    Registration save(Registration registration);
}
