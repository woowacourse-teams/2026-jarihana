package com.project.jarihana.realtime.transport.protocol;

import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.Map;

public final class Values {
    private Values() {}

    public static String text(Map<String, Object> values, String key) {
        Object value = values.get(key);
        if (!(value instanceof String text) || text.isBlank() || text.length() > 128) throw new RuleViolation("INVALID_MESSAGE");
        return text;
    }

    public static int slot(Map<String, Object> values) {
        Object value = values.getOrDefault("slot", 0);
        if (!(value instanceof Number number) || number.doubleValue() != number.intValue() || number.intValue() < 0) {
            throw new RuleViolation("INVALID_SLOT");
        }
        return number.intValue();
    }

    public static double number(Map<String, Object> values, String key) {
        Object value = values.get(key);
        if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())) throw new RuleViolation("INVALID_MESSAGE");
        return number.doubleValue();
    }

    public static Vec3 point(Map<String, Object> values) {
        return new Vec3(number(values, "x"), number(values, "y"), number(values, "z"));
    }

    public static Map<String, Object> object(Object value) {
        if (!(value instanceof Map<?, ?> map)) throw new RuleViolation("INVALID_MESSAGE");
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!(entry.getKey() instanceof String key)) throw new RuleViolation("INVALID_MESSAGE");
            result.put(key, entry.getValue());
        }
        return result;
    }
}
