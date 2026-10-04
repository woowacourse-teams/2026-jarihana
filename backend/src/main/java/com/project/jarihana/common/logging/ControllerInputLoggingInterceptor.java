package com.project.jarihana.common.logging;

import com.project.jarihana.group.query.controller.dto.GroupListRequest;
import com.project.jarihana.groupmember.command.controller.dto.TransferLeaderRequest;
import com.project.jarihana.recruitment.command.controller.dto.CreateRecruitmentRequest;
import com.project.jarihana.recruitment.command.controller.dto.UpdateRecruitmentRequest;
import com.project.jarihana.registration.command.controller.dto.DecideRegistrationRequest;
import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;

public class ControllerInputLoggingInterceptor implements MethodInterceptor {
    @Override
    public Object invoke(MethodInvocation invocation) throws Throwable {
        for (Object argument : invocation.getArguments()) {
            if (argument instanceof CreateRecruitmentRequest value) {
                body("joinMethod", value.joinMethod().name());
                body("capacity", value.capacity());
            }
            if (argument instanceof UpdateRecruitmentRequest value) {
                body("joinMethod", value.joinMethod().name());
                body("capacity", value.capacity());
            }
            if (argument instanceof DecideRegistrationRequest value) { body("status", value.status().name()); }
            if (argument instanceof TransferLeaderRequest value) { body("groupMemberId", value.groupMemberId()); }
            if (argument instanceof GroupListRequest value) {
                query("status", value.status());
                query("relation", value.relation());
                query("role", value.role());
                query("type", value.type());
                query("recruiting", value.recruiting());
                query("size", value.size());
                query("cursor_present", value.cursor() != null);
            }
        }
        return invocation.proceed();
    }

    private void body(String key, Object value) { RequestLogContext.put("jarihana.request.body." + key, value); }

    private void query(String key, Object value) {
        RequestLogContext.put("jarihana.request.query." + key, value instanceof Enum<?> item ? item.name() : value);
    }
}
