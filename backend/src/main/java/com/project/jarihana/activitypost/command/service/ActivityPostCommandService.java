package com.project.jarihana.activitypost.command.service;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostPhotoCommandRepository;
import com.project.jarihana.activitypost.command.service.dto.SaveActivityPostCommand;
import com.project.jarihana.activitypost.command.service.dto.SaveActivityPostResult;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostPhoto;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.image.command.service.ImageLifecycleService;
import com.project.jarihana.image.command.service.ImageReferenceService;
import com.project.jarihana.image.command.service.PromotedImage;
import com.project.jarihana.image.domain.ImageReferenceType;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ActivityPostCommandService {

    private static final String POST_NOT_FOUND_MESSAGE = "활동 기록을 찾을 수 없습니다.";
    private static final String POST_ACCESS_DENIED_MESSAGE = "작성자 또는 모임장만 수정·삭제할 수 있습니다.";
    private static final String MEMBER_ONLY_MESSAGE = "활동 기록은 해당 모임 구성원만 작성할 수 있습니다.";

    private final ActivityPostCommandRepository activityPostCommandRepository;
    private final ActivityPostPhotoCommandRepository activityPostPhotoCommandRepository;
    private final GroupCommandRepository groupCommandRepository;
    private final GroupMemberCommandRepository groupMemberCommandRepository;
    private final MemberRepository memberRepository;
    private final ImageLifecycleService imageLifecycleService;
    private final ImageReferenceService imageReferenceService;
    private final Clock clock;

    public ActivityPostCommandService(
            ActivityPostCommandRepository activityPostCommandRepository,
            ActivityPostPhotoCommandRepository activityPostPhotoCommandRepository,
            GroupCommandRepository groupCommandRepository,
            GroupMemberCommandRepository groupMemberCommandRepository,
            MemberRepository memberRepository,
            ImageLifecycleService imageLifecycleService,
            ImageReferenceService imageReferenceService,
            Clock clock
    ) {
        this.activityPostCommandRepository = activityPostCommandRepository;
        this.activityPostPhotoCommandRepository = activityPostPhotoCommandRepository;
        this.groupCommandRepository = groupCommandRepository;
        this.groupMemberCommandRepository = groupMemberCommandRepository;
        this.memberRepository = memberRepository;
        this.imageLifecycleService = imageLifecycleService;
        this.imageReferenceService = imageReferenceService;
        this.clock = clock;
    }

    @Transactional
    public SaveActivityPostResult create(long memberId, long groupId, SaveActivityPostCommand command) {
        Group group = groupCommandRepository.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹에는 새 활동 기록을 작성할 수 없습니다.");
        }
        groupMemberCommandRepository.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, MEMBER_ONLY_MESSAGE));
        Member author = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));

        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate activityDate = command.activityDate() == null ? LocalDate.now(clock) : command.activityDate();
        validateActivityDate(activityDate);
        PromotedImage image = imageLifecycleService.promote(memberId, groupId, command.imageKey(), now);
        if (activityPostPhotoCommandRepository.findByImageKey(image.imageKey()).isPresent()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 게시된 사진은 다시 사용할 수 없습니다.");
        }

        ActivityPost post = activityPostCommandRepository.save(
                ActivityPost.create(group, author, command.caption(), activityDate, now)
        );
        activityPostPhotoCommandRepository.save(ActivityPostPhoto.create(post, image.imageKey()));
        imageReferenceService.replace(
                ImageReferenceType.ACTIVITY_POST,
                post.getId(),
                groupId,
                java.util.List.of(image),
                now
        );
        return new SaveActivityPostResult(post.getId());
    }

    @Transactional
    public void modify(long memberId, long postId, SaveActivityPostCommand command) {
        ActivityPost post = findActivePost(postId);
        validateCanModify(memberId, post);

        LocalDate activityDate = command.activityDate() == null ? post.getActivityDate() : command.activityDate();
        validateActivityDate(activityDate);
        ActivityPostPhoto photo = activityPostPhotoCommandRepository.findByPostId(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.IMAGE_NOT_FOUND, "활동 사진을 찾을 수 없습니다."));
        String nextImageKey = command.imageKey();
        if (nextImageKey == null || nextImageKey.isBlank()) {
            nextImageKey = photo.getImageKey();
        }
        if (!photo.getImageKey().equals(nextImageKey)) {
            LocalDateTime now = LocalDateTime.now(clock);
            PromotedImage image = imageLifecycleService.promote(
                    memberId,
                    post.getGroup().getId(),
                    nextImageKey,
                    now
            );
            boolean alreadyUsed = activityPostPhotoCommandRepository.findByImageKey(image.imageKey())
                    .map(existing -> !existing.getPost().getId().equals(postId))
                    .orElse(false);
            if (alreadyUsed) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 게시된 사진은 다시 사용할 수 없습니다.");
            }
            photo.replaceImageKey(image.imageKey());
            imageReferenceService.replace(
                    ImageReferenceType.ACTIVITY_POST,
                    postId,
                    post.getGroup().getId(),
                    java.util.List.of(image),
                    now
            );
        }
        post.modify(command.caption(), activityDate);
    }

    @Transactional
    public void delete(long memberId, long postId) {
        ActivityPost post = findActivePost(postId);
        validateCanModify(memberId, post);
        LocalDateTime now = LocalDateTime.now(clock);
        post.deleteAt(now);
        imageReferenceService.removeActivityPost(postId, now);
    }

    @Transactional
    public void hideAllByGroupId(long groupId) {
        LocalDateTime now = LocalDateTime.now(clock);
        activityPostCommandRepository.findAllByGroupIdAndDeletedAtIsNull(groupId)
                .forEach(post -> post.hideAfterGroupDeletion(now));
    }

    private ActivityPost findActivePost(long postId) {
        return activityPostCommandRepository.findByIdAndDeletedAtIsNull(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVITY_POST_NOT_FOUND, POST_NOT_FOUND_MESSAGE));
    }

    private void validateCanModify(long memberId, ActivityPost post) {
        if (post.getAuthor().getId().equals(memberId)) {
            return;
        }
        GroupMember membership = groupMemberCommandRepository
                .findByGroupIdAndMemberId(post.getGroup().getId(), memberId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.ACTIVITY_POST_ACCESS_DENIED,
                        POST_ACCESS_DENIED_MESSAGE
                ));
        if (membership.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.ACTIVITY_POST_ACCESS_DENIED, POST_ACCESS_DENIED_MESSAGE);
        }
    }

    private void validateActivityDate(LocalDate activityDate) {
        if (activityDate.isAfter(LocalDate.now(clock))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "활동 날짜는 오늘 이후로 설정할 수 없습니다.");
        }
    }

}
