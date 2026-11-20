package com.project.jarihana.chat.command.controller;

import com.project.jarihana.chat.command.service.MemberActivityCommandService;

import lombok.RequiredArgsConstructor;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class MemberActivityController {
    private final MemberActivityCommandService activity;

    @MessageMapping("/presence/active")
    public void reportActive(Principal principal) {
        activity.reportActive(Long.parseLong(principal.getName()));
    }
}
