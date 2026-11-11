package com.project.jarihana.member.query.service.dto;

import com.project.jarihana.member.domain.AvatarAppearance;

public record MemberAvatarResult(boolean customized, AvatarAppearance appearance) {
}
