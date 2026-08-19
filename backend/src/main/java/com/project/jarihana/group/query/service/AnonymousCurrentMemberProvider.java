package com.project.jarihana.group.query.service;

import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class AnonymousCurrentMemberProvider extends CurrentMemberProvider {

    @Override
    public Optional<Long> currentMemberId() {
        return Optional.empty();
    }
}
