package com.project.jarihana.sparring.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.image.query.service.ImageAccessService;
import com.project.jarihana.sparring.domain.SparringSide;
import com.project.jarihana.sparring.query.repository.SparringQueryRepository;
import com.project.jarihana.sparring.query.repository.dto.SparringPostProjection;
import com.project.jarihana.sparring.query.repository.dto.SparringTopicProjection;
import com.project.jarihana.sparring.query.service.dto.SparringAvatarPoolsResult;
import com.project.jarihana.sparring.query.service.dto.SparringListQuery;
import com.project.jarihana.sparring.query.service.dto.SparringPageResult;
import com.project.jarihana.sparring.query.service.dto.SparringPostResult;
import com.project.jarihana.sparring.query.service.dto.SparringPostsQuery;
import com.project.jarihana.sparring.query.service.dto.SparringTopicResult;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SparringQueryService {
    private static final int AVATAR_POOL_SIZE = 8;

    private final SparringQueryRepository repository;
    private final SparringPostAppearances postAppearances;
    private final ImageAccessService images;
    private final Clock clock;

    public SparringTopicResult topic(long id, Long memberId) {
        return repository
                .topic(id, memberId)
                .map(this::topicResult)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.SPARRING_NOT_FOUND, "스파링을 찾을 수 없어요."));
    }

    public SparringPageResult<SparringTopicResult> topics(Long memberId, SparringListQuery query) {
        if (query.filter().equals("mine") && memberId == null) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "내가 낀 판은 로그인 후 볼 수 있어요.");
        }
        SparringCursor cursor = SparringCursor.decode(query.cursor());
        List<SparringTopicResult> rows =
                repository
                        .topics(
                                memberId,
                                query.keyword(),
                                query.filter(),
                                LocalDateTime.now(clock),
                                cursor.at(),
                                cursor.id(),
                                PageRequest.ofSize(query.size() + 1))
                        .stream()
                        .map(this::topicResult)
                        .toList();
        boolean more = rows.size() > query.size();
        List<SparringTopicResult> items = rows.stream().limit(query.size()).toList();
        SparringTopicResult last = items.isEmpty() ? null : items.getLast();
        return new SparringPageResult<>(
                items, more ? SparringCursor.encode(last.createdAt(), last.id()) : null, more);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SparringAvatarPoolsResult avatarPools(long topicId) {
        if (repository.revision(topicId).isEmpty()) {
            throw new BusinessException(ErrorCode.SPARRING_NOT_FOUND, "스파링을 찾을 수 없어요.");
        }
        PageRequest limit = PageRequest.ofSize(AVATAR_POOL_SIZE);
        return new SparringAvatarPoolsResult(
                repository.findVoterAppearances(topicId, SparringSide.MINT, limit),
                repository.findVoterAppearances(topicId, SparringSide.CORAL, limit));
    }

    public SparringPageResult<SparringPostResult> posts(
            long topicId, Long memberId, SparringPostsQuery query) {
        if (query.mine() && memberId == null)
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "내 대화는 로그인 후 볼 수 있어요.");
        if (query.afterId() != null
                && (query.cursor() != null
                        || query.mine()
                        || query.side() != null
                        || query.throughId() != null)) {
            throw new BusinessException(
                    ErrorCode.INVALID_PARAMETER, "새 글 조회와 이전 대화 조회는 함께 사용할 수 없어요.");
        }
        topic(topicId, memberId);
        SparringCursor cursor = SparringCursor.decode(query.cursor());
        PageRequest limit = PageRequest.ofSize(query.size() + 1);
        List<SparringPostProjection> rows =
                query.afterId() == null
                        ? repository.posts(
                                topicId,
                                memberId,
                                query.mine(),
                                cursor.at() == null ? null : cursor.id(),
                                query.side() == null ? null : query.side().name(),
                                query.throughId(),
                                limit)
                        : repository.postsAfter(topicId, query.afterId(), limit);
        boolean more = rows.size() > query.size();
        List<SparringPostProjection> page = rows.subList(0, Math.min(rows.size(), query.size()));
        var appearances = postAppearances.findFor(page.stream());
        List<SparringPostResult> items = page.stream()
                .map(post -> SparringPostResult.from(post, appearances))
                .toList();
        SparringPostResult last = items.isEmpty() ? null : items.getLast();
        return new SparringPageResult<>(
                items, more ? SparringCursor.encode(last.createdAt(), last.id()) : null, more);
    }

    private SparringTopicResult topicResult(SparringTopicProjection topic) {
        String key = topic.getRepresentativeImageKey();
        return SparringTopicResult.from(topic, key == null ? null : images.publicUrl(key));
    }
}
