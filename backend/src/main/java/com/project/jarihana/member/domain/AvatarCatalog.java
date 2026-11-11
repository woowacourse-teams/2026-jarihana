package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

public enum AvatarCatalog {
    HAIR("bald", false, Set.of("curly", "parted", "bob", "long", "flowing", "bald")),
    SKIN("warm", false, Set.of("pearl", "warm", "tan", "deep")),
    HAIR_COLOR("ink", false, Set.of("ink", "chestnut", "copper", "silver")),
    FACE("round", false, Set.of("round", "oval", "wide")),
    EYES("dot", false, Set.of("round", "slim", "dot")),
    EYEBROWS("straight", false, Set.of("arched", "straight", "bold")),
    NOSE("small", false, Set.of("round", "small", "wide")),
    MOUTH("flat", false, Set.of("smile", "flat", "open")),
    GLASSES("none", false, Set.of("none", "round", "square", "sunglasses")),
    OUTFIT("cream", false, Set.of("mint", "coral", "cream", "navy", "lilac", "ochre")),
    SHOES("sneakers", true, Set.of("sneakers", "slipOn", "highTop")),
    SHOE_COLOR("white", true, Set.of("white", "ink", "mint", "coral")),
    HAT("none", true, Set.of("none", "cap", "bucket", "beanie", "beret")),
    HAT_COLOR("ink", true, Set.of("ink", "cream", "mint", "coral", "navy")),
    BAG("none", true, Set.of("none", "backpack", "crossbody", "shoulder")),
    BAG_COLOR("ink", true, Set.of("ink", "cream", "mint", "coral", "navy")),
    HANDHELD("none", true, Set.of("none", "hotCoffee", "icedCoffee", "book", "laptop", "phone"));

    private final String basic;
    private final boolean optional;
    private final Set<String> choices;

    AvatarCatalog(String basic, boolean optional, Set<String> choices) {
        this.basic = basic;
        this.optional = optional;
        this.choices = Set.copyOf(choices);
    }

    public boolean isOptional() {
        return optional;
    }

    public static Map<AvatarCatalog, String> basicSelections() {
        var selections = new EnumMap<AvatarCatalog, String>(AvatarCatalog.class);
        for (AvatarCatalog slot : values()) {
            selections.put(slot, slot.basic);
        }
        return Map.copyOf(selections);
    }

    static Map<AvatarCatalog, String> validate(int version, Map<AvatarCatalog, String> selections) {
        if (version != 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "지원하지 않는 아바타 버전입니다.");
        }
        if (selections == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "아바타 파츠가 필요합니다.");
        }
        var validated = new EnumMap<AvatarCatalog, String>(AvatarCatalog.class);
        for (AvatarCatalog slot : values()) {
            String value = selections.get(slot);
            if (value == null && slot.optional) {
                value = slot.basic;
            }
            if (value == null || !slot.choices.contains(value)) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "허용되지 않은 아바타 파츠입니다.");
            }
            validated.put(slot, value);
        }
        return Map.copyOf(validated);
    }
}
