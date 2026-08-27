package com.project.jarihana.group.query.service;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.image.config.ImageProperties;
import com.project.jarihana.group.query.repository.GroupDetailRepository;
import com.project.jarihana.group.query.repository.GroupListRepository;
import com.project.jarihana.group.query.repository.dto.*;
import com.project.jarihana.group.query.service.dto.GroupDetailResult;
import com.project.jarihana.group.query.service.dto.GroupListQuery;
import com.project.jarihana.group.query.service.dto.GroupListResult;
import com.project.jarihana.group.query.service.dto.GroupListResult.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;

@Service
public class GroupQueryService {

    private static final String DEFAULT_REPRESENTATIVE_IMAGE_URL = "images/default-group.png";
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;

    private final GroupListRepository groupListRepository;
    private final GroupDetailRepository groupDetailRepository;
    private final LoginMemberReader loginMemberReader;
    private final Clock clock;
    private final String publicBaseUrl;

    public GroupQueryService(
            GroupListRepository groupListRepository,
            GroupDetailRepository groupDetailRepository,
            LoginMemberReader loginMemberReader
    ) {
        this(groupListRepository, groupDetailRepository, loginMemberReader,
                Clock.system(ZoneId.of("Asia/Seoul")));
    }

    public GroupQueryService(
            GroupListRepository groupListRepository,
            GroupDetailRepository groupDetailRepository,
            LoginMemberReader loginMemberReader,
            Clock clock
    ) {
        this(groupListRepository, groupDetailRepository, loginMemberReader, clock, "");
    }

    @Autowired
    public GroupQueryService(
            GroupListRepository groupListRepository,
            GroupDetailRepository groupDetailRepository,
            LoginMemberReader loginMemberReader,
            Clock clock,
            ImageProperties imageProperties
    ) {
        this(groupListRepository, groupDetailRepository, loginMemberReader, clock, imageProperties.publicBaseUrl());
    }

    GroupQueryService(
            GroupListRepository groupListRepository,
            GroupDetailRepository groupDetailRepository,
            LoginMemberReader loginMemberReader,
            Clock clock,
            String publicBaseUrl
    ) {
        this.groupListRepository = groupListRepository;
        this.groupDetailRepository = groupDetailRepository;
        this.loginMemberReader = loginMemberReader;
        this.clock = clock;
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl;
    }

    public GroupListResult findGroups(GroupListQuery query) {
        validateQuery(query);
        Long currentMemberId = resolveCurrentMemberId(query);
        LocalDateTime now = LocalDateTime.now(clock);
        Cursor cursor = decodeCursor(query.cursor());
        GroupListSearchCriteria criteria = new GroupListSearchCriteria(
                query.status(),
                query.type(),
                query.role(),
                query.relation() != null,
                query.recruiting(),
                query.keyword(),
                currentMemberId,
                now,
                cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id()
        );

        GroupListPage page = groupListRepository.findPage(
                criteria,
                query.size()
        );
        List<GroupListProjection> itemProjections = page.items();
        String nextCursor = page.hasNext()
                ? encodeCursor(itemProjections.get(itemProjections.size() - 1))
                : null;
        List<Item> items = itemProjections.stream()
                .map(this::toResult)
                .toList();
        return new GroupListResult(items, nextCursor, page.hasNext());
    }

    private Item toResult(GroupListProjection projection) {
        GroupListMember leader = projection.leader();
        return new Item(
                projection.id(),
                projection.group().getType().name(),
                projection.group().getStatus().name(),
                projection.group().getName(),
                projection.group().getIntroduction(),
                toRepresentativeImageUrl(projection.group().getRepresentativeImageKey()),
                projection.group().getRecurringSchedule() == null
                        ? null
                        : new RecurringSchedule(
                        projection.group().getRecurringSchedule().getActivityDays().values().stream()
                                .map(Enum::name)
                                .toList(),
                        projection.group().getRecurringSchedule().getStartTime(),
                        projection.group().getRecurringSchedule().getEndTime()
                ),
                projection.group().getSessionSchedule() == null
                        ? null
                        : new SessionSchedule(
                        projection.group().getSessionSchedule().getSessionDate(),
                        projection.group().getSessionSchedule().getStartTime(),
                        projection.group().getSessionSchedule().getEndTime()
                ),
                leader == null
                        ? null
                        : new Leader(
                        leader.memberId(),
                        leader.member().getCrewName(),
                        leader.member().getGeneration()
                ),
                projection.memberCount(),
                projection.activeRecruitment() == null
                        ? null
                        : new ActiveRecruitment(
                        projection.activeRecruitment().getId(),
                        projection.activeRecruitment().getJoinMethod().name(),
                        projection.activeRecruitment().getCapacity(),
                        projection.approvedCount(),
                        projection.activeRecruitment().getStartsAt(),
                        projection.activeRecruitment().getEndsAt()
                )
        );
    }

    private static void validateQuery(GroupListQuery query) {
        if (query == null || query.status() == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
        if (query.role() != null && query.relation() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
    }

    private Long resolveCurrentMemberId(GroupListQuery query) {
        if (query.relation() == null) {
            return null;
        }
        return loginMemberReader.currentMemberId()
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
    }

    private static String encodeCursor(GroupListProjection projection) {
        String value = projection.group().getCreatedAt() + "|" + projection.id();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decodeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] values = decoded.split("\\|", -1);
            if (values.length != 2) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
            }
            return new Cursor(LocalDateTime.parse(values[0]), Long.parseLong(values[1]));
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
    }

    public GroupDetailResult findGroup(Long groupId) {
        if (groupId == null || groupId < 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        GroupDetailProjection projection = groupDetailRepository.findById(groupId, now)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.GROUP_NOT_FOUND,
                        "그룹을 찾을 수 없습니다."
                ));
        Long currentMemberId = loginMemberReader.currentMemberId().orElse(null);
        return new GroupDetailResult(
                projection.group(),
                toRepresentativeImageUrl(projection.group().getRepresentativeImageKey()),
                projection.members(),
                projection.activeRecruitment(),
                projection.approvedCount(),
                projection.roleOf(currentMemberId)
        );
    }

    private String toRepresentativeImageUrl(String imageKey) {
        if (imageKey == null || DEFAULT_REPRESENTATIVE_IMAGE_URL.equals(imageKey)) {
            return DEFAULT_REPRESENTATIVE_IMAGE_URL;
        }
        if (publicBaseUrl.isBlank()) {
            return imageKey;
        }
        return publicBaseUrl.replaceAll("/+$", "") + "/" + imageKey.replaceFirst("^/+", "");
    }

    private record Cursor(LocalDateTime createdAt, long id) {
    }
}
