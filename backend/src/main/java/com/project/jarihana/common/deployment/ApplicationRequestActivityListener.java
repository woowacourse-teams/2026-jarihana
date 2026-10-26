package com.project.jarihana.common.deployment;

import jakarta.servlet.ServletRequestEvent;
import jakarta.servlet.ServletRequestListener;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 앱 ServletContext에 등록되어 비동기 요청의 최종 종료까지 추적한다. */
@Component
@RequiredArgsConstructor
public class ApplicationRequestActivityListener implements ServletRequestListener {
    private static final String ACTIVITY_ATTRIBUTE = ApplicationRequestActivityListener.class.getName();
    private final ApplicationActivity activity;

    @Override
    public void requestInitialized(ServletRequestEvent event) {
        event.getServletRequest().setAttribute(ACTIVITY_ATTRIBUTE, activity.beginHttp());
    }

    @Override
    public void requestDestroyed(ServletRequestEvent event) {
        Object requestActivity = event.getServletRequest().getAttribute(ACTIVITY_ATTRIBUTE);
        if (requestActivity instanceof ApplicationActivity.Activity active) {
            active.close();
            event.getServletRequest().removeAttribute(ACTIVITY_ATTRIBUTE);
        }
    }
}
