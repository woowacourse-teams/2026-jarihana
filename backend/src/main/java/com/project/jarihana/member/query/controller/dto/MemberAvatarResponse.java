package com.project.jarihana.member.query.controller.dto;

import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.member.query.service.dto.MemberAvatarResult;

public record MemberAvatarResponse(boolean customized, AppearanceResponse appearance) {
    public static MemberAvatarResponse from(MemberAvatarResult result) {
        return of(result.customized(), result.appearance());
    }

    public static MemberAvatarResponse of(boolean customized, AvatarAppearance appearance) {
        return new MemberAvatarResponse(customized, AppearanceResponse.from(appearance));
    }

    public record AppearanceResponse(int version, String hair, String skin, String hairColor, String face, String eyes, String eyebrows, String nose, String mouth, String glasses, String outfit, String shoes, String shoeColor, String hat, String hatColor, String bag, String bagColor, String handheld) {
        public static AppearanceResponse from(AvatarAppearance appearance) {
            return new AppearanceResponse(appearance.getVersion(), appearance.getHair(), appearance.getSkin(), appearance.getHairColor(), appearance.getFace(), appearance.getEyes(), appearance.getEyebrows(), appearance.getNose(), appearance.getMouth(), appearance.getGlasses(), appearance.getOutfit(), appearance.getShoes(), appearance.getShoeColor(), appearance.getHat(), appearance.getHatColor(), appearance.getBag(), appearance.getBagColor(), appearance.getHandheld());
        }
    }
}
