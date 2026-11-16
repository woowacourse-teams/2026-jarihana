import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Crown, Swords } from "lucide-react";

import { useAuth } from "../../features/auth";
import {
  RHYTHM_BATTLE_PATH,
  RHYTHM_ENTRY_PATH,
  rhythmBattleInvitePath,
  rhythmBattleRoomPath
} from "../../features/game/rhythm/availability.js";
import { LEVELS } from "../../features/game/rhythm/engine.mjs";
import { RANKED_LEVELS } from "../../features/game/rhythm/rankedApi.js";
import { useEscapeBack } from "../../features/game/rhythm/useEscapeBack.js";
import { fromServerLevel, rhythmBattleApi } from "../../features/game/rhythm/battle/battleApi";
import { readBattleSettings } from "../../features/game/rhythm/battle/battleSettings";
import { RhythmBattleBoard } from "../../features/game/rhythm/battle/RhythmBattleBoard.jsx";
import { RhythmBattleChat } from "../../features/game/rhythm/battle/RhythmBattleChat.jsx";
import { useRhythmBattleRoom } from "../../features/game/rhythm/battle/useRhythmBattleRoom";
import { Avatar, Button, PageContainer } from "../../shared/ui";
import "../../features/game/rhythm/battle/rhythm-battle.css";
import "./games.css";

const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const speedLabel = (speed) => "×" + (Number.isInteger(speed) ? speed.toFixed(1) : speed);
const levelName = (serverLevel) => LEVELS[fromServerLevel(serverLevel)]?.name ?? serverLevel;
const number = (value) => value.toLocaleString("ko-KR");

const OUT_COPY = {
  ELIMINATED: "라이프를 모두 잃었어요.",
  ABANDONED: "판을 떠나 기권했어요.",
  STALE: "연결이 끊겨 기권 처리됐어요.",
  LAGGED: "진행이 멈췄다가 이어져서 기권 처리됐어요.",
  CLOCK_AHEAD: "진행 시각이 맞지 않아 기권 처리됐어요."
};

// 온라인 매칭 대기실이다. 이미 앉은 방이 있으면 그 방으로 돌아가는 안내를 두고 새 방 만들기와 참가를 막는다.
// 방 화면의 "대기실" 링크로 와도 방을 떠나지 않으므로, 여기서 바로 방으로 돌려보내지 않는다.
// 방을 만들 때 공개 여부와 난이도를 고르고, 공개 방 목록에서 바로 참가한다. 아래에 내 전적과 승수 랭킹을 둔다.
export function RhythmBattleLobbyPage() {
  const navigate = useNavigate();
  const { member } = useAuth();
  useEscapeBack(RHYTHM_ENTRY_PATH);
  const mine = useQuery({
    queryKey: ["rhythm-battle", "mine", member?.id],
    queryFn: ({ signal }) => rhythmBattleApi.mine(signal),
    gcTime: 0,
    staleTime: 0
  });
  const lobby = useQuery({
    queryKey: ["rhythm-battle", "lobby", member?.id],
    queryFn: ({ signal }) => rhythmBattleApi.lobby(null, signal),
    refetchInterval: 5000,
    gcTime: 0
  });
  const [visibility, setVisibility] = useState("PUBLIC");
  const [level, setLevel] = useState("easy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const myRoomId = mine.data?.roomId ?? null;
  const seated = myRoomId !== null;

  async function run(operation) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await operation();
      navigate(rhythmBattleRoomPath(roomId));
    } catch (failure) {
      setError(
        failure.status === 409
          ? "이미 참여한 방이 있거나 들어갈 수 없는 방이에요."
          : "요청을 완료하지 못했어요. 다시 시도해 주세요."
      );
      void mine.refetch();
      void lobby.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <div className="games-page rhythm-battle-lobby">
        <Link
          aria-keyshortcuts="Escape"
          className="games-back"
          data-ph-capture-attribute-action="rhythm_entry_back"
          to={RHYTHM_ENTRY_PATH}
        >
          <span>
            <ArrowLeft aria-hidden="true" size={16} /> 행성이의 리듬 작살
          </span>
        </Link>
        <header className="games-heading">
          <h1>온라인 매칭</h1>
          <p>방을 만들어 1:1로 겨뤄요. 같은 채보를 함께 치고, 먼저 라이프를 모두 잃으면 져요.</p>
        </header>
        {seated ? (
          <div className="rhythm-battle-card rhythm-battle-mine" role="status">
            <p>참여 중인 방이 있어요. 새 방에 들어가려면 그 방에서 나와 주세요.</p>
            <Link
              className="ui-button ui-button--primary ui-button--md"
              data-ph-capture-attribute-action="rhythm_battle_my_room_open"
              to={rhythmBattleRoomPath(myRoomId)}
            >
              내 방으로
            </Link>
          </div>
        ) : null}
        <div className="rhythm-battle-lobby__grid">
          <section className="rhythm-battle-card" aria-labelledby="rhythm-battle-create">
            <h2 id="rhythm-battle-create">방 만들기</h2>
            <fieldset className="rhythm-battle-choice">
              <legend>공개 여부</legend>
              {[
                ["PUBLIC", "공개", "대기실 목록에 보여요"],
                ["PRIVATE", "초대 전용", "초대 링크로만 들어와요"]
              ].map(([value, label, hint]) => (
                <label aria-label={label + ", " + hint} className="rhythm-battle-choice__item" key={value}>
                  <input
                    checked={visibility === value}
                    data-ph-capture-attribute-action="rhythm_battle_visibility_select"
                    name="rhythm-battle-visibility"
                    onChange={() => setVisibility(value)}
                    type="radio"
                    value={value}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="rhythm-battle-field" htmlFor="rhythm-battle-level">
              난이도
            </label>
            <select
              data-ph-capture-attribute-action="rhythm_battle_level_select"
              id="rhythm-battle-level"
              onChange={(event) => setLevel(event.target.value)}
              value={level}
            >
              {Object.keys(RANKED_LEVELS).map((key) => (
                <option key={key} value={key}>
                  {LEVELS[key].name}
                </option>
              ))}
            </select>
            <p className="small muted">{LEVELS[level].description}</p>
            <Button
              block
              data-ph-capture-attribute-action="rhythm_battle_create"
              disabled={busy || mine.isPending || seated}
              onClick={() => void run(() => rhythmBattleApi.create({ visibility, level }))}
            >
              <Swords aria-hidden="true" size={18} /> 방 만들기
            </Button>
          </section>

          <section className="rhythm-battle-card" aria-labelledby="rhythm-battle-rooms">
            <h2 id="rhythm-battle-rooms">기다리는 방</h2>
            {lobby.isPending ? (
              <p className="small muted" role="status">
                방 목록을 불러오고 있어요.
              </p>
            ) : lobby.isError ? (
              <p className="small muted" role="alert">
                방 목록을 불러오지 못했어요.
              </p>
            ) : lobby.data.items.length === 0 ? (
              <p className="small muted">기다리는 방이 없어요. 방을 만들어 상대를 기다려 보세요.</p>
            ) : (
              <ul className="rhythm-battle-rooms">
                {lobby.data.items.map((room) => (
                  <li key={room.id}>
                    <Avatar alt={room.hostName + " 프로필"} fallback={room.hostName.slice(0, 1)} size="sm" src={room.hostAvatarUrl} />
                    <span className="rhythm-battle-rooms__name">{room.hostName}</span>
                    <span className="rhythm-battle-rooms__level">{levelName(room.level)}</span>
                    <Button
                      data-ph-capture-attribute-action="rhythm_battle_join"
                      disabled={busy || seated}
                      onClick={() => void run(() => rhythmBattleApi.join(room.id))}
                      size="sm"
                    >
                      참가
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <BattleRecord />
        </div>
        {error ? (
          <p className="rhythm-battle-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </PageContainer>
  );
}

function BattleRecord() {
  const { member } = useAuth();
  const summary = useQuery({
    queryKey: ["rhythm-battle", "summary", member?.id],
    queryFn: ({ signal }) => rhythmBattleApi.summary(signal),
    gcTime: 0,
    staleTime: 0
  });
  const ranking = useQuery({
    queryKey: ["rhythm-battle", "ranking", member?.id],
    queryFn: ({ signal }) => rhythmBattleApi.ranking(null, signal),
    gcTime: 0,
    staleTime: 0
  });
  return (
    <section className="rhythm-battle-card rhythm-battle-record" aria-labelledby="rhythm-battle-record">
      <h2 id="rhythm-battle-record">내 전적과 랭킹</h2>
      {summary.data ? (
        <p className="rhythm-battle-record__mine">
          <strong>{summary.data.wins}승</strong> {summary.data.losses}패 {summary.data.draws}무
        </p>
      ) : null}
      {ranking.data?.items.length ? (
        <ol className="rhythm-battle-ranking" aria-label="승수 랭킹">
          {ranking.data.items.map((row) => (
            <li className={row.memberId === member?.id ? "is-mine" : undefined} key={row.memberId}>
              <span className="rhythm-battle-ranking__rank">{row.rank}</span>
              <Avatar alt={row.name + " 프로필"} fallback={row.name.slice(0, 1)} size="sm" src={row.avatarUrl} />
              <span className="rhythm-battle-ranking__name">{row.name}</span>
              <span className="rhythm-battle-ranking__wins">{row.wins}승</span>
              <small>
                {row.losses}패 {row.draws}무
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="small muted">아직 끝난 대전이 없어요.</p>
      )}
      {ranking.data?.me && !ranking.data.items.some((row) => row.memberId === member?.id) ? (
        <p className="small">내 순위 {ranking.data.me.rank}위</p>
      ) : null}
    </section>
  );
}

// 초대 링크로 들어온 화면이다. 방 정보를 보여 주고 참가하면 방으로 간다.
export function RhythmBattleInvitationPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const invitation = useQuery({
    queryKey: ["rhythm-battle", "invitation", token],
    queryFn: ({ signal }) => rhythmBattleApi.invitation(token, signal),
    retry: false,
    gcTime: 0
  });
  async function join() {
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await rhythmBattleApi.join(invitation.data.roomId, token);
      navigate(rhythmBattleRoomPath(roomId), { replace: true });
    } catch (failure) {
      setError(failure.status === 409 ? "이미 참여한 방이 있거나 자리가 찼어요." : "참가하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageContainer>
      <div className="games-page rhythm-battle-lobby">
        <Link className="games-back" data-ph-capture-attribute-action="rhythm_battle_lobby_back" to={RHYTHM_BATTLE_PATH}>
          <span>
            <ArrowLeft aria-hidden="true" size={16} /> 대기실
          </span>
        </Link>
        <section className="rhythm-battle-card rhythm-battle-invite" aria-labelledby="rhythm-battle-invite">
          <h1 id="rhythm-battle-invite">대전 초대</h1>
          {invitation.isPending ? <p role="status">초대 정보를 확인하고 있어요.</p> : null}
          {invitation.isError ? <p role="alert">초대 링크가 만료되었거나 올바르지 않아요.</p> : null}
          {invitation.data ? (
            <>
              <p>
                <strong>{invitation.data.hostName}</strong>님이 <strong>{levelName(invitation.data.level)}</strong> 대전에 초대했어요.
              </p>
              <Button
                data-ph-capture-attribute-action="rhythm_battle_invite_join"
                disabled={busy || !invitation.data.joinable}
                onClick={() => void join()}
              >
                {invitation.data.joinable ? "참가하기" : "들어갈 수 없는 방이에요"}
              </Button>
            </>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
      </div>
    </PageContainer>
  );
}

// 대전 방이다. 대기 중에는 두 사람의 준비 상태와 초대 링크, 채팅을 보여 주고, 판이 시작되면 두 판을 나란히 띄운다.
// 판이 끝나도 판 화면은 다음 판이 시작될 때까지 그대로 두고 아래에 결과를 보여 준다.
export function RhythmBattleRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { member } = useAuth();
  const battle = useRhythmBattleRoom(roomId);
  const room = battle.room;
  const [settings] = useState(readBattleSettings);
  const [scrollSpeed, setScrollSpeed] = useState(settings.scrollSpeed);
  const [boardGame, setBoardGame] = useState(null);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [outNotice, setOutNotice] = useState(null);
  const playing = room?.status === "PLAYING";
  // 판이 진행 중일 때 Esc는 판이 먼저 받아 기권으로 처리하므로 여기까지 오지 않는다.
  useEscapeBack(RHYTHM_BATTLE_PATH);

  // 판이 시작되면 그 판의 화면을 띄우고, 판이 끝나도 다음 판이 시작될 때까지 그대로 둔다.
  if (room?.status === "PLAYING" && room.gameNumber !== boardGame) {
    setBoardGame(room.gameNumber);
    setOutNotice(null);
  }

  if (!room) {
    return (
      <PageContainer>
        <div className="games-page rhythm-battle-room">
          <p role={battle.error ? "alert" : "status"}>{battle.error ?? "방에 들어가고 있어요."}</p>
          <Link className="ui-button ui-button--secondary ui-button--md" to={RHYTHM_BATTLE_PATH}>
            대기실로
          </Link>
        </div>
      </PageContainer>
    );
  }

  const memberId = member?.id;
  const isHost = room.host.memberId === memberId;
  const me = isHost ? room.host : room.guest;
  const nextGame = room.gameNumber + 1;
  const canPrepare = (room.status === "WAITING" || room.status === "FINISHED") && Boolean(room.guest);
  const showBoard = boardGame !== null && boardGame === room.gameNumber && room.guest;

  async function leave() {
    if (await battle.act(() => rhythmBattleApi.leave(room.id))) navigate(RHYTHM_BATTLE_PATH);
  }

  async function invite() {
    await battle.act(async () => {
      const { token } = await rhythmBattleApi.invite(room.id);
      setInviteUrl(window.location.origin + rhythmBattleInvitePath(token));
    });
  }

  return (
    <PageContainer>
      <div className={"games-page rhythm-battle-room" + (playing ? " is-playing" : "")}>
        <header className="rhythm-battle-room__header">
          {playing ? (
            <span className="rhythm-battle-room__live">대전 중 / Esc는 기권</span>
          ) : (
            <Link
              aria-keyshortcuts="Escape"
              className="games-back"
              data-ph-capture-attribute-action="rhythm_battle_lobby_back"
              to={RHYTHM_BATTLE_PATH}
            >
              <span>
                <ArrowLeft aria-hidden="true" size={16} /> 대기실
              </span>
            </Link>
          )}
          <h1>
            온라인 매칭 <small>{levelName(room.level)}</small>
          </h1>
          {!battle.connected && room.status !== "CLOSED" ? (
            <span className="small muted" role="status">
              연결 중
            </span>
          ) : null}
        </header>

        {showBoard ? (
          <RhythmBattleBoard
            batches={battle.batches}
            key={room.id + ":" + boardGame}
            memberId={memberId}
            onError={(error) => setOutNotice(error.message || "판을 이어 가지 못했어요. 기권 처리됐어요.")}
            onOut={(result) => setOutNotice(OUT_COPY[result.outReason] ?? null)}
            room={room}
            serverOffset={battle.serverOffset}
            settings={{ ...settings, scrollSpeed }}
          />
        ) : null}
        {playing && outNotice ? (
          <p className="rhythm-battle-notice" role="status">
            {outNotice} 상대의 판이 끝나면 결과가 나와요.
          </p>
        ) : null}
        {playing && !showBoard ? <p role="status">진행 중인 판이에요. 다음 판부터 함께할 수 있어요.</p> : null}

        {room.status === "FINISHED" || room.status === "CLOSED" ? <BattleResult memberId={memberId} room={room} /> : null}

        {!playing ? (
          <div className="rhythm-battle-room__grid">
            <section className="rhythm-battle-card" aria-labelledby="rhythm-battle-seats">
              <h2 id="rhythm-battle-seats">참가자</h2>
              <ul className="rhythm-battle-seats">
                {[room.host, room.guest].map((player, index) =>
                  player ? (
                    <li key={player.memberId}>
                      <Avatar alt={player.name + " 프로필"} fallback={player.name.slice(0, 1)} size="sm" src={player.avatarUrl} />
                      <span className="rhythm-battle-seats__name">
                        {player.name}
                        {index === 0 ? <Crown aria-label="방장" size={14} /> : null}
                        {player.memberId === memberId ? <small>나</small> : null}
                      </span>
                      <span className={"rhythm-battle-seats__ready" + (player.ready ? " is-ready" : "")}>
                        {player.ready ? "준비 완료" : "준비 전"}
                      </span>
                    </li>
                  ) : (
                    <li className="is-empty" key="empty">
                      상대를 기다리고 있어요.
                    </li>
                  )
                )}
              </ul>

              {room.status === "WAITING" ? (
                <div className="rhythm-battle-invite-link">
                  {inviteUrl ? (
                    <>
                      <label className="sr-only" htmlFor="rhythm-battle-invite-url">
                        초대 링크
                      </label>
                      <input id="rhythm-battle-invite-url" readOnly value={inviteUrl} />
                      <Button
                        data-ph-capture-attribute-action="rhythm_battle_invite_copy"
                        onClick={() => void navigator.clipboard?.writeText(inviteUrl)}
                        size="sm"
                        variant="secondary"
                      >
                        <Copy aria-hidden="true" size={14} /> 복사
                      </Button>
                    </>
                  ) : (
                    <Button
                      data-ph-capture-attribute-action="rhythm_battle_invite_create"
                      disabled={battle.pending}
                      onClick={() => void invite()}
                      variant="secondary"
                    >
                      초대 링크 만들기
                    </Button>
                  )}
                </div>
              ) : null}

              {canPrepare ? (
                <div className="rhythm-battle-ready">
                  <label htmlFor="rhythm-battle-speed">내 세균 이동 배속</label>
                  <select
                    data-ph-capture-attribute-action="rhythm_battle_speed_change"
                    disabled={me?.ready}
                    id="rhythm-battle-speed"
                    onChange={(event) => setScrollSpeed(Number(event.target.value))}
                    value={String(scrollSpeed)}
                  >
                    {SPEEDS.map((speed) => (
                      <option key={speed} value={String(speed)}>
                        {speedLabel(speed)}
                      </option>
                    ))}
                  </select>
                  <Button
                    data-ph-capture-attribute-action="rhythm_battle_ready_toggle"
                    disabled={battle.pending}
                    onClick={() =>
                      void battle.act(() =>
                        rhythmBattleApi.ready(room.id, { ready: !me?.ready, gameNumber: nextGame, scrollSpeed })
                      )
                    }
                    variant={me?.ready ? "secondary" : "primary"}
                  >
                    {me?.ready ? "준비 취소" : "준비"}
                  </Button>
                  {isHost ? (
                    <Button
                      data-ph-capture-attribute-action="rhythm_battle_start"
                      disabled={battle.pending || !room.host.ready || !room.guest?.ready}
                      onClick={() => void battle.act(() => rhythmBattleApi.start(room.id, nextGame))}
                    >
                      시작
                    </Button>
                  ) : (
                    <p className="small muted">두 사람이 준비하면 방장이 시작해요.</p>
                  )}
                </div>
              ) : null}

              {room.status !== "CLOSED" ? (
                <Button
                  className="rhythm-battle-leave"
                  data-ph-capture-attribute-action="rhythm_battle_leave"
                  disabled={battle.pending}
                  onClick={() => void leave()}
                  variant="secondary"
                >
                  방 나가기
                </Button>
              ) : (
                <Link
                  className="ui-button ui-button--secondary ui-button--md"
                  data-ph-capture-attribute-action="rhythm_battle_lobby_back"
                  to={RHYTHM_BATTLE_PATH}
                >
                  대기실로
                </Link>
              )}
              {battle.error ? (
                <p className="rhythm-battle-error" role="alert">
                  {battle.error}
                </p>
              ) : null}
            </section>

            <RhythmBattleChat
              disabled={room.status === "CLOSED"}
              memberId={memberId}
              messages={battle.messages}
              onSent={battle.addMessage}
              roomId={room.id}
            />
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}

function BattleResult({ room, memberId }) {
  if (!room.endReason) {
    return room.status === "CLOSED" ? (
      <section className="rhythm-battle-result" aria-label="대전 결과">
        <h2>방이 닫혔어요</h2>
        <p>대기실에서 새 방을 만들거나 다른 방에 들어가 보세요.</p>
      </section>
    ) : null;
  }
  const won = room.winnerMemberId === memberId;
  const draw = room.endReason === "DRAW";
  const title = draw ? "무승부" : won ? "승리!" : "패배";
  const reason =
    room.endReason === "DRAW"
      ? "같은 순간에 함께 탈락했어요."
      : room.endReason === "FORFEIT"
        ? won
          ? "상대가 기권했어요."
          : "기권으로 졌어요."
        : won
          ? "상대가 먼저 라이프를 모두 잃었어요."
          : "먼저 라이프를 모두 잃었어요.";
  const names = new Map([[room.host.memberId, room.host.name], ...(room.guest ? [[room.guest.memberId, room.guest.name]] : [])]);
  return (
    <section
      aria-labelledby="rhythm-battle-result-title"
      className={"rhythm-battle-result" + (draw ? " is-draw" : won ? " is-win" : " is-lose")}
    >
      <h2 id="rhythm-battle-result-title">{title}</h2>
      <p>{reason}</p>
      {room.runs.length ? (
        <table className="rhythm-battle-result__table">
          <caption className="sr-only">두 사람의 판 결과</caption>
          <thead>
            <tr>
              <th scope="col">참가자</th>
              <th scope="col">점수</th>
              <th scope="col">최고 콤보</th>
              <th scope="col">PERFECT</th>
              <th scope="col">놓친 세균</th>
            </tr>
          </thead>
          <tbody>
            {room.runs.map((run) => (
              <tr className={run.memberId === room.winnerMemberId ? "is-winner" : undefined} key={run.memberId}>
                <th scope="row">{names.get(run.memberId)}</th>
                <td>{number(run.score)}</td>
                <td>{number(run.bestCombo)}</td>
                <td>{number(run.perfect)}</td>
                <td>{number(run.miss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {room.status === "FINISHED" ? <p className="small muted">둘 다 다시 준비하면 방장이 다음 판을 시작해요.</p> : null}
    </section>
  );
}
