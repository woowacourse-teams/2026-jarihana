package com.project.jarihana.groupmusic.query.service;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.groupmusic.query.repository.GroupMusicQueryRepository;
import com.project.jarihana.groupmusic.domain.MusicDocumentValidator;
import com.project.jarihana.groupmusic.query.service.dto.GroupMusicResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import com.project.jarihana.groupmusic.domain.MusicPlayback;
import com.project.jarihana.groupmusic.domain.PlaybackState;

@Service
@RequiredArgsConstructor
public class GroupMusicQueryService {
    private final GroupMusicQueryRepository musicRepository;
    private final ObjectMapper mapper;
    private final LoginMemberReader loginMemberReader;
    private final Clock clock;

    public GroupMusicResult findGroupMusic(long groupId) {
        var music = musicRepository.findMusic(groupId, loginMemberReader.currentMemberId().orElse(null))
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        String document = music.musicJson() == null ? MusicDocumentValidator.DEFAULT_MUSIC : music.musicJson();
        Instant now = clock.instant();
        MusicPlayback playback = music.musicJson() == null ? MusicPlayback.of(PlaybackState.PAUSED, 0, 0, now, 0)
                : MusicPlayback.of(music.playbackState(), music.playlistIndex(), music.positionSeconds(), music.anchorTime(), music.playbackRevision());
        return new GroupMusicResult(mapper.readTree(document),
                music.revision() == null ? 0 : music.revision(),
                music.role() == GroupMemberRole.LEADER && music.status() == GroupStatus.ACTIVE,
                music.role() != null && music.status() == GroupStatus.ACTIVE, music.updatedAt(), now, playback);
    }
}
