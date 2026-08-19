package com.project.jarihana.group.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.query.repository.dto.GroupListMember;
import com.project.jarihana.group.query.repository.dto.GroupListPage;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.repository.dto.GroupListSearchCriteria;
import com.project.jarihana.group.query.repository.GroupListRepository;
import com.project.jarihana.group.query.service.dto.GroupListQuery;
import com.project.jarihana.group.query.service.dto.GroupListResult;
import com.project.jarihana.group.query.service.dto.GroupListResult.ActiveRecruitment;
import com.project.jarihana.group.query.service.dto.GroupListResult.Item;
import com.project.jarihana.group.query.service.dto.GroupListResult.Leader;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class GroupListService {

    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;

    private final GroupListRepository groupListRepository;
    private final CurrentMemberProvider currentMemberProvider;
    private final Clock clock;

    @Autowired
    public GroupListService(
            GroupListRepository groupListRepository,
            CurrentMemberProvider currentMemberProvider
    ) {
        this(groupListRepository, currentMemberProvider, Clock.system(ZoneId.of("Asia/Seoul")));
    }

    public GroupListService(
            GroupListRepository groupListRepository,
            CurrentMemberProvider currentMemberProvider,
            Clock clock
    ) {
        this.groupListRepository = groupListRepository;
        this.currentMemberProvider = currentMemberProvider;
        this.clock = clock;
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
                .map(GroupListService::toResult)
                .toList();
        return new GroupListResult(items, nextCursor, page.hasNext());
    }

    private static Item toResult(GroupListProjection projection) {
        GroupListMember leader = projection.leader();
        return new Item(
                projection.id(),
                projection.group().getType().name(),
                projection.group().getStatus().name(),
                projection.group().getName(),
                projection.group().getIntroduction(),
                projection.group().getRepresentativeImageKey(),
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
        return currentMemberProvider.currentMemberId()
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

    private record Cursor(LocalDateTime createdAt, long id) {
    }
}
