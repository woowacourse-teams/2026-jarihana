package com.project.jarihana.activitypost.query.service.dto;

import java.util.List;

public record ActivityReactorListResult(String emoji, long count, List<Reactor> reactors) {

    public ActivityReactorListResult {
        reactors = List.copyOf(reactors);
    }

    public record Reactor(String crewName, boolean mine) {
    }
}
