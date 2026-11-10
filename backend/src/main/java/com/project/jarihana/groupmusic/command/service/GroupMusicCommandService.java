package com.project.jarihana.groupmusic.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.groupmusic.command.repository.GroupMusicCommandRepository;
import com.project.jarihana.groupmusic.command.service.dto.AddMusicQueueCommand;
import com.project.jarihana.groupmusic.command.service.dto.AdvancePlaybackCommand;
import com.project.jarihana.groupmusic.command.service.dto.ControlPlaybackCommand;
import com.project.jarihana.groupmusic.command.service.dto.SaveGroupMusicCommand;
import com.project.jarihana.groupmusic.command.service.dto.SaveGroupMusicResult;
import com.project.jarihana.groupmusic.domain.GroupMusic;
import com.project.jarihana.groupmusic.domain.MusicDocumentValidator;
import com.project.jarihana.groupmusic.domain.PlaybackState;
import com.project.jarihana.groupmusic.stream.GroupMusicChanged;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
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
        return result(groupId, musicRepository.saveAndFlush(changed), true, now);
    }

    @Transactional
    public SaveGroupMusicResult addToQueue(long memberId, long groupId, AddMusicQueueCommand command) {
        Group group = lockGroup(groupId);
        GroupMember membership = authorize(group, memberId, false);
        validator.validateQueueEntry(command.title(), command.url());
        GroupMusic current = musicRepository.findByGroupId(groupId).orElse(null);
        ObjectNode document = (ObjectNode) mapper.readTree(current == null
                ? MusicDocumentValidator.DEFAULT_MUSIC : current.getMusicJson());
        ArrayNode queue = document.has("queue") ? (ArrayNode) document.get("queue") : document.putArray("queue");
        if (queue.size() >= 50) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "대기열에는 최대 50개까지 추가할 수 있습니다.");
        }
        ObjectNode entry = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("title", command.title()).put("url", command.url());
        boolean start = !document.get("enabled").asBoolean() || document.get("url").asString().isEmpty();
        if (start) selectSource(document, entry);
        else queue.add(entry);
        Instant now = clock.instant();
        String json = mapper.writeValueAsString(document);
        GroupMusic changed = current == null
                ? GroupMusic.create(group, json, PlaybackState.PLAYING, LocalDateTime.ofInstant(now, clock.getZone()), now)
                : current.replaceMusic(json, start, PlaybackState.PLAYING, now);
        return result(groupId, musicRepository.saveAndFlush(changed), membership.getRole() == GroupMemberRole.LEADER, now);
    }

    @Transactional
    public SaveGroupMusicResult skipQueue(long memberId, long groupId, long expectedRevision) {
        Group group = lockGroup(groupId);
        authorize(group, memberId, true);
        GroupMusic current = enabledMusic(groupId);
        Instant now = clock.instant();
        GroupMusic changed = consumeNext(current, expectedRevision, 0, now);
        return result(groupId, musicRepository.saveAndFlush(changed), true, now);
    }

    @Transactional
    public SaveGroupMusicResult controlPlayback(long memberId, long groupId, ControlPlaybackCommand command) {
        Group group = lockGroup(groupId);
        authorize(group, memberId, true);
        GroupMusic music = enabledMusic(groupId);
        Instant now = clock.instant();
        GroupMusic changed = music.controlPlayback(command.expectedRevision(), command.state(), command.playlistIndex(), command.positionSeconds(), now);
        return result(groupId, musicRepository.saveAndFlush(changed), true, now);
    }

    @Transactional
    public SaveGroupMusicResult advancePlayback(long memberId, long groupId, AdvancePlaybackCommand command) {
        Group group = lockGroup(groupId);
        GroupMember membership = authorize(group, memberId, false);
        GroupMusic music = enabledMusic(groupId);
        Instant now = clock.instant();
        ObjectNode document = (ObjectNode) mapper.readTree(music.getMusicJson());
        boolean queueMode = document.has("queue");
        if (queueMode && !validator.isPlaylist(document.get("url").asString())
                && (command.queueLength() != 1 || command.playlistIndex() != 0)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "단일 영상의 재생 순서를 확인해 주세요.");
        }
        GroupMusic changed = music.advancePlayback(command.expectedRevision(), command.playlistIndex(), command.trackDurationSeconds(), command.queueLength(), now);
        if (queueMode && command.playlistIndex() + 1 == command.queueLength()) {
            changed = consumeNext(music, command.expectedRevision(), changed.getPlayback().positionSeconds(), now);
        }
        return result(groupId, musicRepository.saveAndFlush(changed), membership.getRole() == GroupMemberRole.LEADER, now);
    }

    private GroupMusic consumeNext(GroupMusic current, long expectedRevision, double position, Instant now) {
        ObjectNode document = (ObjectNode) mapper.readTree(current.getMusicJson());
        ArrayNode queue = document.has("queue") ? (ArrayNode) document.get("queue") : document.putArray("queue");
        boolean exhausted = queue.isEmpty();
        if (exhausted) {
            document.put("enabled", false).put("url", "").put("title", "우리 모임의 음악");
            document.remove("currentQueueId");
        } else {
            selectSource(document, queue.remove(0));
        }
        return current.selectQueueSource(expectedRevision, mapper.writeValueAsString(document),
                exhausted ? PlaybackState.PAUSED : PlaybackState.PLAYING, exhausted ? 0 : position, now);
    }

    private void selectSource(ObjectNode document, JsonNode entry) {
        document.put("enabled", true).put("autoplay", true).put("title", entry.get("title").asString())
                .put("url", entry.get("url").asString()).put("currentQueueId", entry.get("id").asString());
    }

    private Group lockGroup(long groupId) {
        return groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
    }

    private GroupMember authorize(Group group, long memberId, boolean leaderOnly) {
        GroupMember membership = members.findByGroupIdAndMemberId(group.getId(), memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "모임 구성원만 재생 상태를 변경할 수 있습니다."));
        if (leaderOnly && membership.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "모임장만 음악 설정과 재생 위치를 변경할 수 있습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임의 음악은 변경할 수 없습니다.");
        }
        return membership;
    }

    private GroupMusic enabledMusic(long groupId) {
        GroupMusic music = musicRepository.findByGroupId(groupId).orElseThrow(this::conflict);
        if (!mapper.readTree(music.getMusicJson()).get("enabled").asBoolean()) throw conflict();
        return music;
    }

    private boolean playbackSettingsChanged(GroupMusic previous, JsonNode next) {
        JsonNode old = mapper.readTree(previous.getMusicJson());
        return !old.get("url").equals(next.get("url")) || !old.get("enabled").equals(next.get("enabled"))
                || !old.get("autoplay").equals(next.get("autoplay"));
    }

    private SaveGroupMusicResult result(long groupId, GroupMusic saved, boolean canEdit, Instant now) {
        events.publishEvent(new GroupMusicChanged(groupId, saved.getRevision(), saved.getPlayback().revision()));
        return new SaveGroupMusicResult(mapper.readTree(saved.getMusicJson()), saved.getRevision(), canEdit, true,
                saved.getUpdatedAt(), now, saved.getPlayback());
    }

    private BusinessException conflict() {
        return new BusinessException(ErrorCode.GROUP_MUSIC_CONFLICT, "음악이 변경되었거나 활성화되지 않았습니다. 최신 설정을 불러와 주세요.");
    }
}
