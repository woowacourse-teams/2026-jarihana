package com.project.jarihana.member.query.controller.dto;

import com.project.jarihana.member.query.service.dto.MemberAffiliationResult;

public record MemberAffiliationResponse(long id, String name) {

    public static MemberAffiliationResponse from(MemberAffiliationResult result) {
        return new MemberAffiliationResponse(result.id(), result.name());
    }
}
