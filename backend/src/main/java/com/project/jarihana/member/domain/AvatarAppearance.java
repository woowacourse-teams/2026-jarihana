package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.util.Set;

@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AvatarAppearance {
    @Column(nullable = false)
    private int version;
    @Column(name = "hair", nullable = false, length = 16)
    private String hair;
    @Column(name = "skin", nullable = false, length = 16)
    private String skin;
    @Column(name = "hair_color", nullable = false, length = 16)
    private String hairColor;
    @Column(name = "face", nullable = false, length = 16)
    private String face;
    @Column(name = "eyes", nullable = false, length = 16)
    private String eyes;
    @Column(name = "eyebrows", nullable = false, length = 16)
    private String eyebrows;
    @Column(name = "nose", nullable = false, length = 16)
    private String nose;
    @Column(name = "mouth", nullable = false, length = 16)
    private String mouth;
    @Column(name = "glasses", nullable = false, length = 16)
    private String glasses;
    @Column(name = "outfit", nullable = false, length = 16)
    private String outfit;
    @Column(name = "shoes", nullable = false, length = 16)
    private String shoes;
    @Column(name = "shoe_color", nullable = false, length = 16)
    private String shoeColor;
    @Column(name = "hat", nullable = false, length = 16)
    private String hat;
    @Column(name = "hat_color", nullable = false, length = 16)
    private String hatColor;
    @Column(name = "bag", nullable = false, length = 16)
    private String bag;
    @Column(name = "bag_color", nullable = false, length = 16)
    private String bagColor;
    @Column(name = "handheld", nullable = false, length = 16)
    private String handheld;

    private AvatarAppearance(int version, String hair, String skin, String hairColor, String face, String eyes, String eyebrows, String nose, String mouth, String glasses, String outfit, String shoes, String shoeColor, String hat, String hatColor, String bag, String bagColor, String handheld) {
        if (version != 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "지원하지 않는 아바타 버전입니다.");
        }
        this.version = version;
        this.hair = requireChoice(hair, Set.of("curly", "parted", "bob", "long", "flowing", "bald"));
        this.skin = requireChoice(skin, Set.of("pearl", "warm", "tan", "deep"));
        this.hairColor = requireChoice(hairColor, Set.of("ink", "chestnut", "copper", "silver"));
        this.face = requireChoice(face, Set.of("round", "oval", "wide"));
        this.eyes = requireChoice(eyes, Set.of("round", "slim", "dot"));
        this.eyebrows = requireChoice(eyebrows, Set.of("arched", "straight", "bold"));
        this.nose = requireChoice(nose, Set.of("round", "small", "wide"));
        this.mouth = requireChoice(mouth, Set.of("smile", "flat", "open"));
        this.glasses = requireChoice(glasses, Set.of("none", "round", "square", "sunglasses"));
        this.outfit = requireChoice(outfit, Set.of("mint", "coral", "cream", "navy", "lilac", "ochre"));
        this.shoes = requireChoice(shoes, Set.of("sneakers", "slipOn", "highTop"));
        this.shoeColor = requireChoice(shoeColor, Set.of("white", "ink", "mint", "coral"));
        this.hat = requireChoice(hat, Set.of("none", "cap", "bucket", "beanie", "beret"));
        this.hatColor = requireChoice(hatColor, Set.of("ink", "cream", "mint", "coral", "navy"));
        this.bag = requireChoice(bag, Set.of("none", "backpack", "crossbody", "shoulder"));
        this.bagColor = requireChoice(bagColor, Set.of("ink", "cream", "mint", "coral", "navy"));
        this.handheld = requireChoice(handheld, Set.of("none", "hotCoffee", "icedCoffee", "book", "laptop", "phone"));
    }

    public static AvatarAppearance of(int version, String hair, String skin, String hairColor, String face, String eyes, String eyebrows, String nose, String mouth, String glasses, String outfit, String shoes, String shoeColor, String hat, String hatColor, String bag, String bagColor, String handheld) {
        return new AvatarAppearance(version, hair, skin, hairColor, face, eyes, eyebrows, nose, mouth, glasses, outfit, shoes, shoeColor, hat, hatColor, bag, bagColor, handheld);
    }

    public static AvatarAppearance basic() {
        return of(1, "bald", "warm", "ink", "round", "dot", "straight", "small", "flat", "none", "cream", "sneakers", "white", "none", "ink", "none", "ink", "none");
    }

    private static String requireChoice(String value, Set<String> choices) {
        if (value == null || !choices.contains(value)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "허용되지 않은 아바타 파츠입니다.");
        }
        return value;
    }
}
