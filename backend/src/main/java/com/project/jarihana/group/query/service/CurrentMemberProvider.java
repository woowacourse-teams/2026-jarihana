package com.project.jarihana.group.query.service;

import java.util.Optional;

public abstract class CurrentMemberProvider {

    public abstract Optional<Long> currentMemberId();
}
