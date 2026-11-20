package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.domain.MemberType;
import jakarta.validation.constraints.NotBlank;

/**
 * 가입 화면은 닉네임만 보낸다. 크루 여부와 기수, 과정은 크루 명단으로 정하므로 요청에서 받지 않는다.
 *
 * <p>{@code memberType}은 코치 가입({@code COACH})에만 쓰고 그 밖의 값은 무시한다. 이전 가입 화면이
 * 보내는 기수, 과정, 소속 정보도 알 수 없는 필드로 무시된다.
 */
public record MemberSignupRequest(
        @NotBlank String crewName,
        MemberType memberType
) {
}
