package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityReactorListResult;
import java.util.List;

public record ActivityReactorListResponse(
        String emoji,
        long count,
        List<Reactor> reactors,
        String nextCursor,
        boolean hasNext
) {

    public static ActivityReactorListResponse from(ActivityReactorListResult result) {
        return new ActivityReactorListResponse(
                result.emoji(),
                result.count(),
                result.reactors().stream().map(Reactor::from).toList(),
                result.nextCursor(),
                result.hasNext()
        );
    }

    public record Reactor(
            String crewName,
            String avatarUrl,
            String memberType,
            Integer generation,
            String course,
            boolean mine
    ) {

        private static Reactor from(ActivityReactorListResult.Reactor reactor) {
            return new Reactor(
                    reactor.crewName(),
                    reactor.avatarUrl(),
                    reactor.memberType(),
                    reactor.generation(),
                    reactor.course(),
                    reactor.mine()
            );
        }
    }
}
