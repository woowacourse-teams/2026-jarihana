package com.project.jarihana.sparring.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.sparring.query.repository.SparringQueryRepository;
import com.project.jarihana.sparring.query.service.dto.SparringListQuery;
import com.project.jarihana.sparring.query.service.dto.SparringPageResult;
import com.project.jarihana.sparring.query.service.dto.SparringPostResult;
import com.project.jarihana.sparring.query.service.dto.SparringPostsQuery;
import com.project.jarihana.sparring.query.service.dto.SparringTopicResult;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SparringQueryService {
    private final SparringQueryRepository repository;

    public SparringTopicResult topic(long id, Long memberId) {
        return repository
                .topic(id, memberId)
                .map(SparringTopicResult::from)
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
                                cursor.at(),
                                cursor.id(),
                                PageRequest.ofSize(query.size() + 1))
                        .stream()
                        .map(SparringTopicResult::from)
                        .toList();
        boolean more = rows.size() > query.size();
        List<SparringTopicResult> items = rows.stream().limit(query.size()).toList();
        SparringTopicResult last = items.isEmpty() ? null : items.getLast();
        return new SparringPageResult<>(
                items, more ? SparringCursor.encode(last.createdAt(), last.id()) : null, more);
    }

    public SparringPageResult<SparringPostResult> posts(
            long topicId, Long memberId, SparringPostsQuery query) {
        if (query.mine() && memberId == null)
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "내 대화는 로그인 후 볼 수 있어요.");
        if (query.afterId() != null && (query.cursor() != null || query.mine())) {
            throw new BusinessException(
                    ErrorCode.INVALID_PARAMETER, "새 글 조회와 이전 대화 조회는 함께 사용할 수 없어요.");
        }
        topic(topicId, memberId);
        SparringCursor cursor = SparringCursor.decode(query.cursor());
        List<SparringPostResult> rows =
                (query.afterId() == null
                                ? repository.posts(
                                        topicId,
                                        memberId,
                                        query.mine(),
                                        cursor.at() == null ? null : cursor.id(),
                                        PageRequest.ofSize(query.size() + 1))
                                : repository.postsAfter(
                                        topicId,
                                        query.afterId(),
                                        PageRequest.ofSize(query.size() + 1)))
                        .stream().map(SparringPostResult::from).toList();
        boolean more = rows.size() > query.size();
        List<SparringPostResult> items = rows.stream().limit(query.size()).toList();
        SparringPostResult last = items.isEmpty() ? null : items.getLast();
        return new SparringPageResult<>(
                items, more ? SparringCursor.encode(last.createdAt(), last.id()) : null, more);
    }
}
