package com.project.jarihana.chat.command.service;

import com.project.jarihana.chat.command.repository.MemberActivityCommandRepository;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class MemberActivityCommandService {
    private final MemberActivityCommandRepository activity;
    private final Clock clock;

    @Transactional
    public void reportActive(long memberId) {
        activity.updateIfNewer(memberId, LocalDateTime.now(clock));
    }
}
