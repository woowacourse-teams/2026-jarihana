package com.project.jarihana.member.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.member.query.controller.dto.MemberAffiliationResponse;
import com.project.jarihana.member.query.service.MemberAffiliationQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 내 정보 응답은 이전 프론트엔드가 모르는 필드를 거부하므로, 확인된 소속은 별도 경로로 준다.
 */
@RestController
@RequestMapping("/members/me/affiliations")
@RequiredArgsConstructor
public class MemberAffiliationQueryController {

    private final MemberAffiliationQueryService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<MemberAffiliationResponse>>> findMyAffiliations(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(service.findMyAffiliations(memberId).stream()
                .map(MemberAffiliationResponse::from)
                .toList()));
    }
}
