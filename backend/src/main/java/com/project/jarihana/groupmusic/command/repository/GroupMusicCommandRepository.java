package com.project.jarihana.groupmusic.command.repository;

import com.project.jarihana.groupmusic.domain.GroupMusic;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface GroupMusicCommandRepository extends Repository<GroupMusic, Long> {
    Optional<GroupMusic> findByGroupId(long groupId);
    GroupMusic saveAndFlush(GroupMusic music);
}
