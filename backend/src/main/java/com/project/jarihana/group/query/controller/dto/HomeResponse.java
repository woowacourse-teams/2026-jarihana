package com.project.jarihana.group.query.controller.dto;

import com.project.jarihana.group.query.service.dto.HomeResult;

public record HomeResponse(GroupListResponse today, GroupListResponse recruiting, GroupListResponse ended) {

    public static HomeResponse from(HomeResult result) {
        return new HomeResponse(GroupListResponse.from(result.today()),
                GroupListResponse.from(result.recruiting()), GroupListResponse.from(result.ended()));
    }
}
