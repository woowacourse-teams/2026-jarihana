package com.project.jarihana.common.logging;

import com.project.jarihana.auth.command.service.AuthCommandService;
import com.project.jarihana.auth.command.service.GithubOAuthCommandService;
import com.project.jarihana.auth.command.service.dto.GithubLoginResult;
import com.project.jarihana.auth.command.service.dto.LogoutCommand;
import com.project.jarihana.group.command.service.GroupCommandService;
import com.project.jarihana.group.command.service.dto.CreateGroupResult;
import com.project.jarihana.group.command.service.dto.TerminateGroupResult;
import com.project.jarihana.recruitment.command.service.dto.CloseRecruitmentResult;
import com.project.jarihana.image.command.service.dto.CreateImageUploadResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.groupmember.command.service.GroupMemberCommandService;
import com.project.jarihana.groupmember.command.service.dto.TransferLeaderResult;
import com.project.jarihana.image.command.service.ImageUploadCommandService;
import com.project.jarihana.member.command.service.MemberCommandService;
import com.project.jarihana.member.command.service.dto.MemberSignupResult;
import com.project.jarihana.recruitment.command.service.RecruitmentCommandService;
import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentResult;
import com.project.jarihana.recruitment.command.service.dto.UpdateRecruitmentResult;
import com.project.jarihana.registration.command.service.RegistrationCommandService;
import com.project.jarihana.registration.command.service.dto.CreateRegistrationResult;
import com.project.jarihana.registration.command.service.dto.DecideRegistrationResult;
import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;
import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;
import org.slf4j.MDC;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class BusinessOperationLoggingInterceptor implements MethodInterceptor {
    private static final Map<Class<?>, Map<String, String>> OPERATIONS = Map.of(
            MemberCommandService.class, Map.of("signup", "member.signup"),
            GithubOAuthCommandService.class, Map.of("login", "auth.github.login"),
            AuthCommandService.class, Map.of("logout", "auth.logout"),
            GroupCommandService.class, Map.of("createGroup", "group.create", "modifyGroup", "group.modify",
                    "deleteGroup", "group.delete", "terminateGroup", "group.end",
                    "replaceRecurringSchedule", "group.recurring.replace", "removeRecurringSchedule", "group.recurring.remove",
                    "replaceSessionSchedule", "group.session.replace"),
            RecruitmentCommandService.class, Map.of("createRecruitment", "recruitment.create", "updateRecruitment", "recruitment.update",
                    "closeRecruitment", "recruitment.close"),
            RegistrationCommandService.class, Map.of("createRegistration", "registration.create",
                    "decideRegistration", "registration.decide", "withdrawRegistration", "registration.withdraw"),
            GroupMemberCommandService.class, Map.of("transferLeader", "group.leader.transfer"),
            ImageUploadCommandService.class, Map.of("createImageUpload", "image.upload_url.create"));

    public static boolean matches(Method method, Class<?> targetClass) {
        return OPERATIONS.getOrDefault(targetClass, Map.of()).containsKey(method.getName());
    }

    @Override
    public Object invoke(MethodInvocation invocation) throws Throwable {
        String action = OPERATIONS.getOrDefault(invocation.getMethod().getDeclaringClass(), Map.of())
                .get(invocation.getMethod().getName());
        if (action == null) { return invocation.proceed(); }
        long started = System.nanoTime();
        Map<String, Object> fields = arguments(invocation);
        Object result;
        try {
            result = invocation.proceed();
        } catch (Throwable error) {
            fields.put("error.type", error.getClass().getName());
            if (error instanceof BusinessException business) { fields.put("jarihana.error_code", business.getErrorCode().name()); }
            Events.emit(action + ".failed", null, "end", "failure", System.nanoTime() - started, fields);
            throw error;
        }
        addResult(fields, result);
        Map<String, Object> snapshot = Map.copyOf(fields);
        Map<String, String> context = MDC.getCopyOfContextMap();
        long duration = System.nanoTime() - started;
        Runnable emit = () -> emitWithContext(action, duration, snapshot, context);
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() { emit.run(); }
            });
        } else {
            emit.run();
        }
        return result;
    }

    private Map<String, Object> arguments(MethodInvocation invocation) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("jarihana.event.category", "business");
        Class<?> owner = invocation.getMethod().getDeclaringClass();
        Object[] args = invocation.getArguments();
        if (args.length > 0 && args[0] instanceof Long memberId) {
            RequestLogContext.setMemberId(memberId);
            fields.put("jarihana.member.id", memberId);
        }
        if (args.length > 0 && args[0] instanceof LogoutCommand command && command.memberId() != null) {
            RequestLogContext.setMemberId(command.memberId());
            fields.put("jarihana.member.id", command.memberId());
        }
        if (args.length > 1 && args[1] instanceof Long id) {
            fields.put(owner == RegistrationCommandService.class ? "jarihana.recruitment.id" : "jarihana.group.id", id);
        }
        if (args.length > 2 && args[2] instanceof Long id) {
            fields.put(owner == RegistrationCommandService.class ? "jarihana.registration.id" : "jarihana.recruitment.id", id);
        }
        return fields;
    }

    private void addResult(Map<String, Object> fields, Object result) {
        if (result instanceof MemberSignupResult value) {
            fields.put("jarihana.member.id", value.id());
            RequestLogContext.setMemberId(value.id());
        }
        if (result instanceof GithubLoginResult value) { fields.put("jarihana.signup_required", value.signupRequired()); }
        if (result instanceof CreateGroupResult value) {
            fields.put("jarihana.group.id", value.id());
            fields.put("jarihana.group.status", value.status().name());
        }
        if (result instanceof TerminateGroupResult value) {
            fields.put("jarihana.group.id", value.id());
            fields.put("jarihana.group.status", value.status().name());
        }
        if (result instanceof CloseRecruitmentResult value) {
            fields.put("jarihana.recruitment.id", value.id());
            fields.put("jarihana.recruitment.phase", value.phase().name());
        }
        if (result instanceof CreateImageUploadResult value) { fields.put("jarihana.image_upload.id", value.id().toString()); }
        if (result instanceof CreateRecruitmentResult value) {
            fields.put("jarihana.recruitment.id", value.id());
            fields.put("jarihana.recruitment.capacity", value.capacity());
            fields.put("jarihana.recruitment.join_method", value.joinMethod().name());
            fields.put("jarihana.recruitment.phase", value.phase().name());
        }
        if (result instanceof UpdateRecruitmentResult value) {
            fields.put("jarihana.recruitment.id", value.id());
            fields.put("jarihana.recruitment.capacity", value.capacity());
            fields.put("jarihana.recruitment.join_method", value.joinMethod().name());
            fields.put("jarihana.recruitment.phase", value.phase().name());
        }
        if (result instanceof CreateRegistrationResult value) {
            fields.put("jarihana.registration.id", value.id());
            fields.put("jarihana.registration.status", value.status().name());
            if (value.decidedByType() != null) { fields.put("jarihana.registration.decided_by_type", value.decidedByType().name()); }
        }
        if (result instanceof DecideRegistrationResult value) {
            fields.put("jarihana.registration.id", value.id());
            fields.put("jarihana.registration.status", value.status().name());
            if (value.decidedByType() != null) { fields.put("jarihana.registration.decided_by_type", value.decidedByType().name()); }
        }
        if (result instanceof TransferLeaderResult value) {
            fields.put("jarihana.group_member.previous_leader_id", value.previousLeaderGroupMemberId());
            fields.put("jarihana.group_member.leader_id", value.leaderGroupMemberId());
        }
    }

    private void emitWithContext(String action, long duration, Map<String, Object> fields, Map<String, String> context) {
        Map<String, String> previous = MDC.getCopyOfContextMap();
        try {
            if (context == null) { MDC.clear(); } else { MDC.setContextMap(context); }
            Events.emit(action + ".completed", null, "end", "success", duration, fields);
        } finally {
            if (previous == null) { MDC.clear(); } else { MDC.setContextMap(previous); }
        }
    }
}
