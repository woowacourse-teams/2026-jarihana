package com.project.jarihana.sparring.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.sparring.query.repository.SparringQueryRepository;
import com.project.jarihana.sparring.query.repository.dto.SparringPostProjection;
import com.project.jarihana.sparring.query.service.dto.SparringPostResult;
import com.project.jarihana.sparring.query.service.dto.SparringStreamResult;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class SparringStreamQueryService {
    private final SparringQueryRepository repository;
    private final SparringPostAppearances postAppearances;

    // Revision, totals and posts must describe one committed snapshot, before advancing the cursor.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SparringStreamResult poll(
            long topicId, long previousRevision, long afterId, boolean snapshotRequired) {
        long revision =
                repository
                        .revision(topicId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.SPARRING_NOT_FOUND, "스파링을 찾을 수 없어요."));
        if (revision == previousRevision && !snapshotRequired) return null;
        var topic =
                repository
                        .topic(topicId, null)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.SPARRING_NOT_FOUND, "스파링을 찾을 수 없어요."));
        List<SparringPostProjection> latestRows =
                snapshotRequired
                        ? repository.posts(topicId, null, false, null, null, null, PageRequest.ofSize(30))
                        : List.of();
        List<SparringPostProjection> addedRows =
                previousRevision >= 0 && revision != previousRevision
                        ? repository.postsAfter(topicId, afterId, Pageable.unpaged())
                        : List.of();
        var appearances = postAppearances.findFor(Stream.concat(latestRows.stream(), addedRows.stream()));
        List<SparringPostResult> latest = latestRows.stream()
                .map(post -> SparringPostResult.from(post, appearances))
                .sorted(Comparator.comparingLong(SparringPostResult::id))
                .toList();
        List<SparringPostResult> added = addedRows.stream()
                .map(post -> SparringPostResult.from(post, appearances))
                .toList();
        return new SparringStreamResult(
                revision,
                topic.getVotesA(),
                topic.getVotesB(),
                topic.getPostCount(),
                latest,
                added);
    }
}
