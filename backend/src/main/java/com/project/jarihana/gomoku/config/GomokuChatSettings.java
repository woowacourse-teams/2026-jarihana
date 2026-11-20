package com.project.jarihana.gomoku.config;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class GomokuChatSettings {
    private final boolean enabled;

    public GomokuChatSettings(@Value("${gomoku.chat.enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    public boolean enabled() {
        return enabled;
    }

    public void requireEnabled() {
        if (!enabled) throw new BusinessException(ErrorCode.GOMOKU_CHAT_DISABLED, "게임방 채팅을 사용할 수 없어요.");
    }
}
