package com.project.jarihana.common.logging;

import java.util.Map;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

public final class SafeExceptionLogFields {
    private static final int MAX_TRACE_LENGTH = 8192;
    private static final int MAX_FRAMES_PER_CAUSE = 24;

    private SafeExceptionLogFields() { }

    public static Map<String, Object> from(Throwable error) {
        StringBuilder trace = new StringBuilder();
        Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        Throwable cause = error;
        while (cause != null && trace.length() < MAX_TRACE_LENGTH && visited.add(cause)) {
            trace.append(cause.getClass().getName()).append('\n');
            StackTraceElement[] frames = cause.getStackTrace();
            for (int index = 0; index < Math.min(frames.length, MAX_FRAMES_PER_CAUSE); index++) {
                if (trace.length() >= MAX_TRACE_LENGTH) { break; }
                StackTraceElement frame = frames[index];
                trace.append(frame.getClassName()).append('.').append(frame.getMethodName()).append('(')
                        .append(frame.getFileName()).append(':').append(frame.getLineNumber()).append(")\n");
            }
            cause = cause.getCause();
        }
        return Map.of("error.type", error.getClass().getName(),
                "error.stack_trace", trace.substring(0, Math.min(trace.length(), MAX_TRACE_LENGTH)));
    }
}
