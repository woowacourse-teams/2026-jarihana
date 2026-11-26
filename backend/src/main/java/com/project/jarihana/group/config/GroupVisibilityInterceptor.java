package com.project.jarihana.group.config;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.query.repository.GroupVisibilityRepository;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Map;
import java.util.Optional;

/**
 * 소속 공개와 비공개 모임을 컨트롤러에 닿기 전에 숨긴다.
 *
 * <p>경로 변수로 모임을 찾을 수 있는 요청은 조회와 명령 모두 여기서 판정하고, 보이지 않으면 없는 자원과 같은 404로
 * 응답한다. 서블릿 필터가 아니라 인터셉터에 두는 이유는 Spring이 이미 매칭한 경로 패턴과 변수를 그대로 쓰고,
 * 예외를 {@code GlobalExceptionHandler}로 보내기 위해서다. 페이지를 나누는 목록은 크기가 줄지 않도록 각 쿼리의
 * WHERE에서 거르고, 신청과 초대 수락은 공개 범위 전환과 겹칠 때를 위해 트랜잭션 안에서도 다시 판정한다.
 * 비동기 디스패치는 처음 요청에서 이미 판정했으므로 건너뛴다.
 */
@Component
@RequiredArgsConstructor
public class GroupVisibilityInterceptor implements HandlerInterceptor {

    private final GroupVisibilityRepository visibility;
    private final LoginMemberReader loginMemberReader;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (request.getDispatcherType() != DispatcherType.REQUEST || !(handler instanceof HandlerMethod)) {
            return true;
        }
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        Object variables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (pattern == null || !(variables instanceof Map<?, ?> values)) {
            return true;
        }
        String path = pattern.toString();
        Long viewerId = null;
        boolean viewerRead = false;
        for (GroupVisibilityGuard guard : GroupVisibilityGuard.values()) {
            if (!guard.appliesTo(path)) {
                continue;
            }
            Optional<Long> id = positiveId(values.get(guard.variable()));
            if (id.isEmpty()) {
                continue;
            }
            if (!viewerRead) {
                viewerId = loginMemberReader.currentMemberId().orElse(null);
                viewerRead = true;
            }
            if (isHidden(guard, path, id.get(), viewerId)) {
                throw notFound(guard);
            }
        }
        return true;
    }

    private boolean isHidden(GroupVisibilityGuard guard, String path, long id, Long viewerId) {
        return switch (guard) {
            case GROUP -> visibility.isGroupHidden(id, viewerId);
            case RECRUITMENT -> visibility.isRecruitmentHidden(id, viewerId);
            case ACTIVITY_POST -> visibility.isActivityPostHidden(id, viewerId);
            case ACTIVITY_POST_COMMENT -> visibility.isActivityPostCommentHidden(id, viewerId);
            case INVITATION -> visibility.isInvitationHidden(
                    id, viewerId, path.equals("/invitations/{invitationId}/acceptances"));
        };
    }

    private static BusinessException notFound(GroupVisibilityGuard guard) {
        return switch (guard) {
            case GROUP -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
            case RECRUITMENT -> new BusinessException(ErrorCode.RECRUITMENT_NOT_FOUND, "모집 공고를 찾을 수 없습니다.");
            case ACTIVITY_POST -> new BusinessException(ErrorCode.ACTIVITY_POST_NOT_FOUND, "활동 기록을 찾을 수 없습니다.");
            case ACTIVITY_POST_COMMENT -> new BusinessException(ErrorCode.ACTIVITY_POST_COMMENT_NOT_FOUND, "댓글을 찾을 수 없습니다.");
            case INVITATION -> new BusinessException(ErrorCode.INVITATION_NOT_FOUND, "초대를 찾을 수 없습니다.");
        };
    }

    /**
     * 숫자가 아니거나 양수가 아닌 값은 판정하지 않고 컨트롤러의 기존 검증에 맡긴다.
     */
    private static Optional<Long> positiveId(Object value) {
        if (value == null) {
            return Optional.empty();
        }
        try {
            long id = Long.parseLong(value.toString());
            return id > 0 ? Optional.of(id) : Optional.empty();
        } catch (NumberFormatException exception) {
            return Optional.empty();
        }
    }
}
