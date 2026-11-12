import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../../features/auth/index.js";
import { useGroup } from "../../features/group/index.js";
import { fetchGroupSpace, useGroupSpace, useSaveGroupSpace } from "../../features/group-space/index.js";
import { Button, ErrorState, Skeleton } from "../../shared/ui/index.js";
import { ClubhouseSetupDialog } from "./ClubhouseSetupDialog.jsx";
import { SpaceStudioPage } from "./SpaceStudioPage.jsx";
import { createInitialRoom, readSavedRoom, validateRoom } from "./roomState.js";

function SpaceError({ error, groupId, onRetry, clubhouse }) {
  const denied = error?.status === 403;
  const missing = error?.status === 404;
  return <div className={clubhouse ? "clubhouse-unavailable" : "page-container"} aria-label="모임 공간 안내">
    <ErrorState title={denied ? "모임원만 들어갈 수 있어요" : missing ? "모임을 찾을 수 없어요" : "공간을 불러오지 못했어요"}
      description={denied ? "모임에 참여한 계정으로 아지트에 들어와 주세요." : missing ? "모임이 삭제되었거나 주소가 바뀌었을 수 있어요." : "연결을 확인하고 다시 시도해 주세요. 저장된 공간을 기본 배치로 바꾸지 않았어요."}
      action={<>
        {!denied && !missing && onRetry && <Button data-ph-capture-attribute-action="group_space_retry" onClick={onRetry}>다시 시도</Button>}
        <Link className="ui-button ui-button--secondary" data-ph-capture-attribute-action="group_space_back" to={missing ? "/groups" : `/groups/${groupId}`}>모임으로 돌아가기</Link>
      </>} />
    {clubhouse?.overlay}
  </div>;
}

function LoadedGroupSpace({ groupId, group, snapshot, initialRoom, clubhouse, setup }) {
  const [editor, setEditor] = useState({ room: initialRoom, revision: snapshot.revision });
  const [canEdit, setCanEdit] = useState(snapshot.canEdit);
  const [savedAt, setSavedAt] = useState(snapshot.updatedAt);
  const [hasSavedRoom, setHasSavedRoom] = useState(snapshot.room !== null);
  const revision = useRef(snapshot.revision);
  const saving = useRef(false);
  const mutation = useSaveGroupSpace(groupId);

  function acceptSavedSnapshot(response) {
    revision.current = response.revision;
    setSavedAt(response.updatedAt);
    setHasSavedRoom(true);
    setCanEdit(response.canEdit);
  }

  async function save(room, { initialSetup = false } = {}) {
    if (!canEdit) throw new Error("모임장만 공간을 꾸밀 수 있어요.");
    if (saving.current) throw new Error("공간을 저장하고 있어요. 잠시만 기다려 주세요.");
    const normalized = validateRoom(room);
    if (!normalized) throw new Error("공간 배치를 확인해 주세요. 저장하지 않았어요.");
    saving.current = true;
    try {
      const response = await mutation.mutateAsync({ room: normalized, expectedRevision: revision.current });
      const saved = validateRoom(response.room);
      if (!saved || response.revision <= revision.current) {
        throw new Error("서버의 저장 결과를 확인하지 못했어요. 편집 내용은 그대로 있어요. 공간을 다시 열어 확인해 주세요.");
      }
      acceptSavedSnapshot(response);
      return saved;
    } catch (error) {
      if (error?.code === "GROUP_SPACE_CONFLICT") {
        if (initialSetup) throw error;
        throw new Error("다른 곳에서 공간이 먼저 저장됐어요. 편집 내용은 그대로 있어요. 새로고침하여 최신 공간을 확인한 뒤 다시 꾸며 주세요.");
      }
      if (error?.status === 403 || error?.code === "GROUP_ENDED") {
        setCanEdit(false);
        throw new Error("공간을 꾸밀 권한이 변경됐어요. 편집 내용은 저장되지 않았어요.");
      }
      if (error?.status === 401) throw new Error("로그인이 만료됐어요. 다시 로그인한 뒤 저장해 주세요.");
      throw error;
    } finally {
      saving.current = false;
    }
  }

  async function saveInitialTemplate(template) {
    const room = { ...createInitialRoom(template), name: editor.room.name };
    try {
      const saved = await save(room, { initialSetup: true });
      setEditor({ room: saved, revision: revision.current });
      return true;
    } catch (error) {
      if (error?.code !== "GROUP_SPACE_CONFLICT") throw error;
      const latest = await fetchGroupSpace(groupId);
      const saved = latest.room && readSavedRoom(latest.room);
      if (!saved || latest.revision <= revision.current) throw error;
      acceptSavedSnapshot(latest);
      setEditor({ room: saved, revision: latest.revision });
      return false;
    }
  }

  const needsSetup = Boolean(setup && canEdit && snapshot.room === null && !hasSavedRoom);
  const scene = clubhouse && needsSetup ? { ...clubhouse, inputBlocked: true } : clubhouse;
  return <>
    <SpaceStudioPage key={editor.revision} clubhouse={scene} initialRoom={editor.room} onSave={save} canEdit={canEdit} savedAt={savedAt}
      groupContext={{ id: group.id, name: group.name, memberCount: group.memberCount,
        backHref: `/groups/${groupId}`, membersHref: `/groups/${groupId}?tab=members` }} />
    {needsSetup && <ClubhouseSetupDialog {...setup} onSave={saveInitialTemplate} />}
  </>;
}

export function GroupSpaceLoader({ groupId, memberId, clubhouse, setup }) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const group = useGroup(groupId);
  const space = useGroupSpace(groupId, memberId);
  const savedRoom = space.isFetchedAfterMount ? space.data?.room : undefined;
  const defaultRoomName = savedRoom === null ? group.data?.name : undefined;
  const room = useMemo(() => {
    if (savedRoom === undefined) return null;
    if (savedRoom !== null) return readSavedRoom(savedRoom);
    return defaultRoomName === undefined ? null : { ...createInitialRoom(), name: defaultRoomName.slice(0, 30) };
  }, [savedRoom, defaultRoomName]);
  const errors = [space.isError && space.error, group.isError && group.error].filter(Boolean);
  const accessError = errors.find((error) => [401, 403, 404].includes(error.status));
  const failed = Boolean(accessError || (!hasLoaded && (group.isError || space.isError)));
  const pending = group.isPending || space.isPending || !space.isFetchedAfterMount || !group.data || !space.data;
  const unavailableStatus = failed ? "error" : pending ? "loading" : !room ? "error" : null;
  const onSceneStatus = clubhouse?.onSceneStatus;
  useEffect(() => {
    if (unavailableStatus) onSceneStatus?.(unavailableStatus);
  }, [onSceneStatus, unavailableStatus]);
  if (failed) {
    return <SpaceError clubhouse={clubhouse} groupId={groupId} error={accessError ?? errors[0]}
      onRetry={() => { void group.refetch(); void space.refetch(); }} />;
  }
  if (pending) {
    return <div className="route-loading"><Skeleton aria-label="우리 모임 공간 불러오는 중" /></div>;
  }
  if (!room) return <SpaceError clubhouse={clubhouse} groupId={groupId} onRetry={() => void space.refetch()} />;
  if (!hasLoaded) setHasLoaded(true);
  return <LoadedGroupSpace key={`${groupId}:${memberId}`} groupId={groupId}
    clubhouse={clubhouse} group={group.data} snapshot={space.data} initialRoom={room} setup={setup} />;
}

export function GroupSpacePage() {
  const { groupId } = useParams();
  const auth = useAuth();
  const memberId = (auth.member ?? auth.user)?.id;
  if (!/^[1-9]\d*$/.test(groupId ?? "") || !Number.isSafeInteger(Number(groupId))) {
    return <SpaceError groupId={groupId} error={{ status: 404 }} />;
  }
  return <GroupSpaceLoader key={`${groupId}:${memberId}`} groupId={groupId} memberId={memberId} />;
}
