package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityReactorListResult;
import java.util.List;

public record ActivityReactorListResponse(String emoji, long count, List<Reactor> reactors) {

    public static ActivityReactorListResponse from(ActivityReactorListResult result) {
        return new ActivityReactorListResponse(
                result.emoji(),
                result.count(),
                result.reactors().stream().map(reactor -> new Reactor(reactor.crewName(), reactor.mine())).toList()
        );
    }

    public record Reactor(String crewName, boolean mine) {
    }
}
