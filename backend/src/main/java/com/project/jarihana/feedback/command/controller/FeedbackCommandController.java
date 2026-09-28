package com.project.jarihana.feedback.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.feedback.command.controller.dto.CreateFeedbackRequest;
import com.project.jarihana.feedback.command.controller.dto.CreateFeedbackResponse;
import com.project.jarihana.feedback.command.service.FeedbackCommandService;
import com.project.jarihana.feedback.command.service.dto.CreateFeedbackResult;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/feedbacks")
@RequiredArgsConstructor
public class FeedbackCommandController {

    private final FeedbackCommandService feedbackCommandService;

    @PostMapping
    public ResponseEntity<ApiResponse<CreateFeedbackResponse>> createFeedback(
            @LoginMember long memberId,
            @Valid @RequestBody CreateFeedbackRequest request
    ) {
        CreateFeedbackResult result = feedbackCommandService.createFeedback(memberId, request.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(CreateFeedbackResponse.from(result)));
    }
}
