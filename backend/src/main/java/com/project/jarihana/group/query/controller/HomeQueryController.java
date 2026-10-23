package com.project.jarihana.group.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.group.query.controller.dto.HomeRequest;
import com.project.jarihana.group.query.controller.dto.HomeResponse;
import com.project.jarihana.group.query.service.GroupQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

@RestController
@RequestMapping("/home")
@RequiredArgsConstructor
public class HomeQueryController {

    private final GroupQueryService groupQueryService;
    private final Clock clock;

    @GetMapping
    public ResponseEntity<ApiResponse<HomeResponse>> findHome(@Validated @ModelAttribute HomeRequest request) {
        return ResponseEntity.ok(ApiResponse.success(HomeResponse.from(groupQueryService.findHome(request.toQuery(clock)))));
    }
}
