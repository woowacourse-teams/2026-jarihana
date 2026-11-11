package com.project.jarihana.groupmusic.query.repository;

import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import java.time.LocalDateTime;
import java.time.Instant;
import com.project.jarihana.groupmusic.domain.PlaybackState;

public record GroupMusicProjection(String musicJson, Long revision, LocalDateTime updatedAt,
                                   GroupStatus status, GroupMemberRole role, PlaybackState playbackState, Integer playlistIndex,
                                   Double positionSeconds, Instant anchorTime, Long playbackRevision) {}
