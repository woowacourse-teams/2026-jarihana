package com.project.jarihana.groupmusic.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.transaction.ConcurrentCommandExecutor;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.groupmusic.client.YoutubeMusicClient;
import com.project.jarihana.groupmusic.client.YoutubeMusicClient.PlaylistTrack;
import com.project.jarihana.groupmusic.command.repository.GroupMusicCommandRepository;
import com.project.jarihana.groupmusic.command.service.dto.AddMusicQueueCommand;
import com.project.jarihana.groupmusic.command.service.dto.AdvancePlaybackCommand;
import com.project.jarihana.groupmusic.command.service.dto.ControlPlaybackCommand;
import com.project.jarihana.groupmusic.command.service.dto.SaveGroupMusicCommand;
import com.project.jarihana.groupmusic.command.service.dto.SaveGroupMusicResult;
import com.project.jarihana.groupmusic.domain.GroupMusic;
import com.project.jarihana.groupmusic.domain.MusicDocumentValidator;
import com.project.jarihana.groupmusic.domain.MusicPlayback;
import com.project.jarihana.groupmusic.domain.MusicQueueTimeline;
import com.project.jarihana.groupmusic.domain.PlaybackState;
import com.project.jarihana.groupmusic.stream.GroupMusicChanged;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Service
@RequiredArgsConstructor
public class GroupMusicCommandService {
    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository members;
    private final GroupMusicCommandRepository musicRepository;
    private final MusicDocumentValidator validator;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final YoutubeMusicClient youtube;
    private final ConcurrentCommandExecutor transactions;
    private final ApplicationEventPublisher events;

    @Transactional
    public SaveGroupMusicResult saveGroupMusic(long memberId, long groupId, SaveGroupMusicCommand command) {
        Group group = lockGroup(groupId);
        authorize(group, memberId, true);
        String musicJson = validator.validateAndSerialize(command.music());
        GroupMusic current = musicRepository.findByGroupId(groupId).orElse(null);
        if (current != null && mapper.readTree(current.getMusicJson()).has("queue")) throw conflict();
        long revision = current == null ? 0 : current.getRevision();
        if (command.expectedRevision() != revision) throw conflict();
        Instant now = clock.instant();
        PlaybackState state = command.music().get("enabled").asBoolean() && command.music().get("autoplay").asBoolean()
                ? PlaybackState.PLAYING : PlaybackState.PAUSED;
        GroupMusic changed = current == null
                ? GroupMusic.create(group, musicJson, state, LocalDateTime.ofInstant(now, clock.getZone()), now)
                : current.replaceMusic(musicJson, playbackSettingsChanged(current, command.music()), state, now);
        return result(groupId, musicRepository.saveAndFlush(changed), now);
    }

    public SaveGroupMusicResult addToQueue(long memberId, long groupId, AddMusicQueueCommand command) {
        String videoId = validator.validateQueueEntry(command.title(), command.url());
        transactions.execute(() -> {
            authorize(findGroup(groupId), memberId, false);
            return true;
        });
        Duration duration = youtube.findPlayableDuration(videoId).orElseThrow(() ->
                new BusinessException(ErrorCode.GROUP_MUSIC_VIDEO_UNPLAYABLE, "삭제되었거나 외부 재생이 허용되지 않은 영상입니다."));
        return transactions.execute(() -> appendVerifiedVideo(memberId, groupId, command, videoId, duration));
    }

    private SaveGroupMusicResult appendVerifiedVideo(long memberId, long groupId, AddMusicQueueCommand command,
                                                     String videoId, Duration duration) {
        Group group = lockGroup(groupId);
        authorize(group, memberId, false);
        Instant now = clock.instant();
        GroupMusic current = musicRepository.findByGroupId(groupId)
                .map(music -> projectTimeline(music, now)).orElse(null);
        ObjectNode document = (ObjectNode) mapper.readTree(current == null
                ? MusicDocumentValidator.DEFAULT_MUSIC : current.getMusicJson());
        ArrayNode queue = document.has("queue") ? (ArrayNode) document.get("queue") : document.putArray("queue");
        if (queue.size() >= 50) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "대기열에는 최대 50개까지 추가할 수 있습니다.");
        }
        ObjectNode entry = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("title", command.title()).put("url", "https://www.youtube.com/watch?v=" + videoId)
                .put("durationSeconds", duration.toMillis() / 1000.0)
                .put("verifiedAt", now.toString());
        boolean start = !document.get("enabled").asBoolean() || document.get("url").asString().isEmpty();
        if (start) MusicQueueTimeline.select(document, entry);
        else queue.add(entry);
        String json = mapper.writeValueAsString(document);
        GroupMusic changed = current == null
                ? GroupMusic.create(group, json, PlaybackState.PLAYING, LocalDateTime.ofInstant(now, clock.getZone()), now)
                : current.replaceMusic(json, start, PlaybackState.PLAYING, now);
        return result(groupId, musicRepository.saveAndFlush(changed), now);
    }

    @Transactional
    public SaveGroupMusicResult skipQueue(long memberId, long groupId, long expectedRevision,
                                          String expectedCurrentQueueId) {
        Group group = lockGroup(groupId);
        authorize(group, memberId, false);
        Instant now = clock.instant();
        GroupMusic current = enabledMusic(groupId, now);
        ObjectNode document = (ObjectNode) mapper.readTree(current.getMusicJson());
        requireCurrentQueueId(document, expectedCurrentQueueId);
        GroupMusic changed = consumeNext(current, document, expectedRevision, now);
        return result(groupId, musicRepository.saveAndFlush(changed), now);
    }

    @Transactional
    public SaveGroupMusicResult controlPlayback(long memberId, long groupId, ControlPlaybackCommand command) {
        Group group = lockGroup(groupId);
        GroupMember membership = authorize(group, memberId, false);
        Instant now = clock.instant();
        GroupMusic music = enabledMusic(groupId, now);
        JsonNode document = mapper.readTree(music.getMusicJson());
        requireCurrentQueueId(document, command.expectedCurrentQueueId());
        GroupMusic changed = changePlayback(music, document, command, membership, now);
        return result(groupId, musicRepository.saveAndFlush(changed), now);
    }

    private GroupMusic changePlayback(GroupMusic music, JsonNode document, ControlPlaybackCommand command,
                                      GroupMember membership, Instant now) {
        MusicPlayback playback = music.getPlayback();
        if (MusicQueueTimeline.isScheduled(document)) {
            return music.controlPlayback(command.expectedRevision(), command.state(), 0, playback.positionAt(now), now);
        }
        if (membership.getRole() == GroupMemberRole.LEADER || isNextLegacyPlaylistTrack(document, command, playback)) {
            return music.controlPlayback(command.expectedRevision(), command.state(), command.playlistIndex(),
                    command.positionSeconds(), now);
        }
        return music.controlPlayback(command.expectedRevision(), command.state(), playback.playlistIndex(),
                playback.positionAt(now), now);
    }

    private boolean isNextLegacyPlaylistTrack(JsonNode document, ControlPlaybackCommand command, MusicPlayback playback) {
        return command.state() == PlaybackState.PLAYING && command.positionSeconds() == 0
                && command.playlistIndex() == playback.playlistIndex() + 1
                && validator.playlistId(document.get("url").asString()).isPresent();
    }

    public SaveGroupMusicResult advancePlayback(long memberId, long groupId, AdvancePlaybackCommand command) {
        GroupMusic observed = transactions.execute(() -> {
            authorize(findGroup(groupId), memberId, false);
            GroupMusic music = enabledMusic(groupId, clock.instant());
            music.requirePlayingRevision(command.expectedRevision());
            return music;
        });
        JsonNode document = mapper.readTree(observed.getMusicJson());
        requireCurrentQueueId(document, command.expectedCurrentQueueId());
        if (!command.checkUnavailable() && MusicQueueTimeline.isScheduled(document)) {
            throw conflict();
        }
        String url = document.get("url").asString();
        int index = observed.getPlayback().playlistIndex();
        String queueId = MusicQueueTimeline.currentQueueId(document);
        PlaylistTrack track = resolveTrack(url, index);
        // A browser report only asks for verification. It never supplies trusted metadata.
        Duration duration = verifiedDuration(document, track.videoId(), command.checkUnavailable());
        return transactions.execute(() -> advanceVerifiedVideo(memberId, groupId, command, url, index, queueId, track, duration));
    }

    private PlaylistTrack resolveTrack(String url, int index) {
        return validator.playlistId(url)
                .map(playlistId -> youtube.getPlaylistTrack(playlistId, index))
                .orElseGet(() -> new PlaylistTrack(validator.videoId(url).orElseThrow(this::conflict), false));
    }

    private Duration verifiedDuration(JsonNode document, String videoId, boolean checkUnavailable) {
        if (!checkUnavailable && validator.playlistId(document.get("url").asString()).isEmpty()
                && document.has("durationSeconds") && document.has("verifiedAt")
                && Instant.parse(document.get("verifiedAt").asString()).plus(Duration.ofDays(1)).isAfter(clock.instant())) {
            return Duration.ofMillis((long) (document.get("durationSeconds").asDouble() * 1000));
        }
        return youtube.findPlayableDuration(videoId).orElse(null);
    }

    private SaveGroupMusicResult advanceVerifiedVideo(long memberId, long groupId, AdvancePlaybackCommand command,
                                                      String url, int index, String queueId, PlaylistTrack track,
                                                      Duration duration) {
        Group group = lockGroup(groupId);
        authorize(group, memberId, false);
        Instant now = clock.instant();
        GroupMusic music = enabledMusic(groupId, now);
        music.requirePlayingRevision(command.expectedRevision());
        ObjectNode document = (ObjectNode) mapper.readTree(music.getMusicJson());
        if (!Objects.equals(queueId, MusicQueueTimeline.currentQueueId(document))
                || !url.equals(document.get("url").asString()) || index != music.getPlayback().playlistIndex()) {
            throw conflict();
        }
        GroupMusic changed = advanceConfirmedTrack(music, document, command, track, duration, now);
        return result(groupId, musicRepository.saveAndFlush(changed), now);
    }

    private GroupMusic advanceConfirmedTrack(GroupMusic music, ObjectNode document, AdvancePlaybackCommand command,
                                             PlaylistTrack track, Duration duration, Instant now) {
        long revision = command.expectedRevision();
        int nextIndex = track.hasNext() ? music.getPlayback().playlistIndex() + 1 : 0;
        if (duration == null) {
            String skippedTitle = document.get("title").asString();
            if (!track.hasNext()) {
                boolean hasNext = MusicQueueTimeline.selectNext(document);
                document.put("lastSkippedTitle", skippedTitle);
                return music.selectQueueSource(revision, mapper.writeValueAsString(document),
                        hasNext ? PlaybackState.PLAYING : PlaybackState.PAUSED, 0, now);
            }
            document.put("lastSkippedTitle", skippedTitle);
            return music.skipUnavailableTrack(revision, nextIndex, now)
                    .replaceMusic(mapper.writeValueAsString(document), false, PlaybackState.PLAYING, now);
        }
        if (command.checkUnavailable()) {
            throw conflict();
        }
        GroupMusic advanced = music.advancePlayback(revision, nextIndex, duration.toMillis() / 1000.0, now);
        if (document.has("queue") && !track.hasNext()) {
            return consumeNext(music, document, revision, now);
        }
        return advanced;
    }

    private GroupMusic consumeNext(GroupMusic current, ObjectNode document, long expectedRevision, Instant now) {
        boolean hasNext = MusicQueueTimeline.selectNext(document);
        return current.selectQueueSource(expectedRevision, mapper.writeValueAsString(document),
                hasNext ? PlaybackState.PLAYING : PlaybackState.PAUSED, 0, now);
    }

    private Group findGroup(long groupId) {
        return groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
    }

    private Group lockGroup(long groupId) {
        return groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
    }

    private GroupMember authorize(Group group, long memberId, boolean leaderOnly) {
        GroupMember membership = members.findByGroupIdAndMemberId(group.getId(), memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "모임 구성원만 재생 상태를 변경할 수 있습니다."));
        if (leaderOnly && membership.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "모임장만 음악 설정을 변경할 수 있습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임의 음악은 변경할 수 없습니다.");
        }
        return membership;
    }

    private GroupMusic enabledMusic(long groupId, Instant now) {
        GroupMusic music = musicRepository.findByGroupId(groupId)
                .map(current -> projectTimeline(current, now)).orElseThrow(this::conflict);
        if (!mapper.readTree(music.getMusicJson()).get("enabled").asBoolean()) {
            throw conflict();
        }
        return music;
    }

    private GroupMusic projectTimeline(GroupMusic music, Instant now) {
        ObjectNode document = (ObjectNode) mapper.readTree(music.getMusicJson());
        MusicPlayback stored = music.getPlayback();
        MusicPlayback effective = MusicQueueTimeline.project(document, stored, now);
        if (effective == stored) {
            return music;
        }
        return music.withProjectedTimeline(mapper.writeValueAsString(document), effective);
    }

    private void requireCurrentQueueId(JsonNode document, String expectedCurrentQueueId) {
        if (expectedCurrentQueueId != null && !expectedCurrentQueueId.equals(MusicQueueTimeline.currentQueueId(document))) {
            throw conflict();
        }
    }

    private boolean playbackSettingsChanged(GroupMusic previous, JsonNode next) {
        JsonNode old = mapper.readTree(previous.getMusicJson());
        return !old.get("url").equals(next.get("url")) || !old.get("enabled").equals(next.get("enabled"))
                || !old.get("autoplay").equals(next.get("autoplay"));
    }

    private SaveGroupMusicResult result(long groupId, GroupMusic saved, Instant now) {
        events.publishEvent(new GroupMusicChanged(groupId, saved.getRevision(), saved.getPlayback().revision()));
        return new SaveGroupMusicResult(mapper.readTree(saved.getMusicJson()), saved.getRevision(), true, true,
                saved.getUpdatedAt(), now, saved.getPlayback());
    }

    private BusinessException conflict() {
        return new BusinessException(ErrorCode.GROUP_MUSIC_CONFLICT, "음악이 변경되었거나 활성화되지 않았습니다. 최신 설정을 불러와 주세요.");
    }
}
