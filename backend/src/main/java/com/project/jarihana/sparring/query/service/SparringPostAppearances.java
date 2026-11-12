package com.project.jarihana.sparring.query.service;

import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.sparring.query.repository.SparringQueryRepository;
import com.project.jarihana.sparring.query.repository.dto.SparringPostProjection;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

@Component
@RequiredArgsConstructor
class SparringPostAppearances {
    private static final int BATCH_SIZE = 1_000;

    private final SparringQueryRepository repository;

    Map<Long, AvatarAppearance> findFor(Stream<SparringPostProjection> posts) {
        List<Long> authorIds = posts
                .flatMap(post -> Stream.of(post.getAuthorId(), post.getReplyAuthorId()))
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<Long, AvatarAppearance> appearances = new HashMap<>();
        for (int start = 0; start < authorIds.size(); start += BATCH_SIZE) {
            List<Long> batch = authorIds.subList(start, Math.min(start + BATCH_SIZE, authorIds.size()));
            repository.findAuthorAvatars(batch)
                    .forEach(avatar -> appearances.put(avatar.getId(), avatar.getAppearance()));
        }
        return appearances;
    }
}
