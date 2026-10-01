package com.project.jarihana.common.logging;

import com.project.jarihana.auth.client.GithubOAuthHttpClient;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.image.client.S3ImageStorage;
import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;
import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;

public class ExternalAdapterLoggingInterceptor implements MethodInterceptor {
    public static boolean matches(Method method, Class<?> targetClass) {
        return (targetClass == S3ImageStorage.class && (method.getName().equals("exists") || method.getName().equals("issueUploadUrl")))
                || (targetClass == GithubOAuthHttpClient.class && method.getName().equals("getGithubId"));
    }

    @Override
    public Object invoke(MethodInvocation invocation) throws Throwable {
        String method = invocation.getMethod().getName();
        String action = method.equals("exists") ? "s3.object.exists" : method.equals("issueUploadUrl") ? "s3.presign" : "github.identity";
        long started = System.nanoTime();
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("jarihana.adapter", action.startsWith("s3.") ? "S3ImageStorage" : "GithubOAuthHttpClient");
        try {
            Object result = invocation.proceed();
            if (result instanceof Boolean exists) { fields.put("jarihana.object_exists", exists); }
            Events.emit(action + ".completed", "network", "end", "success", System.nanoTime() - started, fields);
            return result;
        } catch (Throwable error) {
            fields.put("error.type", error.getClass().getName());
            if (error instanceof BusinessException business) { fields.put("jarihana.error_code", business.getErrorCode().name()); }
            Events.emit(action + ".failed", "network", "end", "failure", System.nanoTime() - started, fields);
            throw error;
        }
    }
}
