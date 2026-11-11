package com.project.jarihana.points.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.points.config.PointRewardRules;
import com.project.jarihana.points.query.repository.PointQueryRepository.HistoryItem;
import com.project.jarihana.points.query.service.PointQueryService.Quota;
import com.project.jarihana.points.query.service.PointQueryService.WeeklyQuota;
import com.project.jarihana.points.query.service.PointQueryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/members/me/points")
@RequiredArgsConstructor
public class PointQueryController {
    private final PointQueryService queries;
    private final PointRewardRules rules;

    @GetMapping
    public ResponseEntity<ApiResponse<SummaryResponse>> findSummary(@LoginMember long memberId) {
        var result = queries.summary(memberId);
        return ResponseEntity.ok(ApiResponse.success(new SummaryResponse(result.enabled(), result.balance(), result.processing(),
                result.resetsAt(),
                result.weeklyQuotas().stream().map(WeeklyQuotaResponse::from).toList())));
    }

    @GetMapping("/transactions")
    public ResponseEntity<ApiResponse<HistoryResponse>> findHistory(
            @LoginMember long memberId,
            @Valid @ModelAttribute HistoryRequest request
    ) {
        var result = queries.history(memberId, request.cursor(), request.size());
        return ResponseEntity.ok(ApiResponse.success(new HistoryResponse(
                result.items().stream()
                        .map(item -> HistoryItemResponse.from(item, rules.findLabel(item.reason()).orElse(null)))
                        .toList(),
                result.nextCursor(), result.hasNext())));
    }

    public record SummaryResponse(boolean enabled, long balance, boolean processing,
                                  LocalDateTime resetsAt, List<WeeklyQuotaResponse> weeklyQuotas) {
    }

    public record WeeklyQuotaResponse(String reason, String label, Quota quota) {
        static WeeklyQuotaResponse from(WeeklyQuota weekly) {
            return new WeeklyQuotaResponse(weekly.reason(), weekly.label(), weekly.quota());
        }
    }

    public record HistoryRequest(@Size(max = 100) String cursor, @Min(1) @Max(100) Integer size) {
        public HistoryRequest {
            if (size == null) {
                size = 20;
            }
        }
    }

    public record HistoryResponse(List<HistoryItemResponse> items, String nextCursor, boolean hasNext) {
    }

    public record HistoryItemResponse(String id, String reason, String label, long amount, LocalDateTime occurredAt, String status,
                                      String skipReason, LocalDateTime completedAt) {
        static HistoryItemResponse from(HistoryItem item, String label) {
            return new HistoryItemResponse(Long.toString(item.id()), item.reason(), label, item.amount(), item.occurredAt(),
                    item.status(), item.skipReason(), item.completedAt());
        }
    }
}
