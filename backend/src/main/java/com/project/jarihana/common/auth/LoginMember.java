package com.project.jarihana.common.auth;

import java.lang.annotation.*;

/**
 * 인증된 회원의 식별자를 Controller 파라미터로 받는다.
 *
 * <p>인증을 전제로 하므로 자격 증명 없이 접근할 수 있는 경로에는 사용하지 않는다.
 * 리소스 단위 권한은 이 값을 받은 Service와 도메인이 판단한다.
 */
@Documented
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface LoginMember {
}
