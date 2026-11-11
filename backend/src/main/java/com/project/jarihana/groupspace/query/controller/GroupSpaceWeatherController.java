package com.project.jarihana.groupspace.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupspace.query.controller.dto.GroupSpaceWeatherResponse;
import com.project.jarihana.groupspace.query.service.GroupSpaceWeatherService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GroupSpaceWeatherController {
    private final GroupSpaceWeatherService service;

    @GetMapping("/group-spaces/weather")
    public ResponseEntity<ApiResponse<GroupSpaceWeatherResponse>> findWeather() {
        return ResponseEntity.ok(ApiResponse.success(GroupSpaceWeatherResponse.from(service.findWeather())));
    }
}
