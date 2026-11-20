package com.project.jarihana.member.command.controller.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.member.domain.AvatarCatalog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.EnumMap;
import tools.jackson.databind.JsonNode;

public record CustomizeAvatarRequest(
        JsonNode expectedMemberId,
        @NotNull @Valid AppearanceRequest appearance
) {
    public CustomizeAvatarRequest {
        if (expectedMemberId == null || !expectedMemberId.isIntegralNumber()
                || !expectedMemberId.canConvertToLong() || expectedMemberId.longValue() <= 0) {
            throw new IllegalArgumentException("편집을 시작한 회원 ID는 양의 정수여야 합니다.");
        }
    }

    public long editorMemberId() {
        return expectedMemberId.longValue();
    }

    public record AppearanceRequest(JsonNode version, String hair, String skin, String hairColor, String face, String eyes, String eyebrows, String nose, String mouth, String glasses, String outfit, String shoes, String shoeColor, String hat, String hatColor, String bag, String bagColor, String handheld) {
        public AppearanceRequest {
            if (version == null || !version.isIntegralNumber() || !version.canConvertToInt() || version.intValue() != 1) {
                throw new IllegalArgumentException("아바타 버전은 정수 1이어야 합니다.");
            }
        }

        @JsonAnySetter
        void rejectUnknownPart(String name, JsonNode value) {
            throw new IllegalArgumentException("지원하지 않는 아바타 필드입니다.");
        }

        public AvatarAppearance toAppearance() {
            var selections = new EnumMap<AvatarCatalog, String>(AvatarCatalog.class);
            selections.put(AvatarCatalog.HAIR, hair);
            selections.put(AvatarCatalog.SKIN, skin);
            selections.put(AvatarCatalog.HAIR_COLOR, hairColor);
            selections.put(AvatarCatalog.FACE, face);
            selections.put(AvatarCatalog.EYES, eyes);
            selections.put(AvatarCatalog.EYEBROWS, eyebrows);
            selections.put(AvatarCatalog.NOSE, nose);
            selections.put(AvatarCatalog.MOUTH, mouth);
            selections.put(AvatarCatalog.GLASSES, glasses);
            selections.put(AvatarCatalog.OUTFIT, outfit);
            selections.put(AvatarCatalog.SHOES, shoes);
            selections.put(AvatarCatalog.SHOE_COLOR, shoeColor);
            selections.put(AvatarCatalog.HAT, hat);
            selections.put(AvatarCatalog.HAT_COLOR, hatColor);
            selections.put(AvatarCatalog.BAG, bag);
            selections.put(AvatarCatalog.BAG_COLOR, bagColor);
            selections.put(AvatarCatalog.HANDHELD, handheld);
            return AvatarAppearance.of(version.intValue(), selections);
        }
    }
}
