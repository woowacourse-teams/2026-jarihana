import { moveRequestId } from "../../features/gomoku/moveRequestId";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Gamepad2,
  Clock3,
  BookOpen,
  ArrowLeft,
  Copy,
  Users,
  Globe,
  Lock,
  ArrowRight,
  Search
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { storeReturnTarget, useAuth } from "../../features/auth";
import { gomokuApi, turnMemberId } from "../../features/gomoku/api";
import { STICK_HALVING_ROOM_PATH, usePeperoDayStatus } from "../../features/pepero-day";
import { syncGomokuMembership } from "../../features/gomoku/membership";
import { useGomokuRoom } from "../../features/gomoku/useGomokuRoom";
import { Board } from "../../features/gomoku/Board";
import { Stone } from "../../features/gomoku/Stone";
import { ReadinessControls } from "../../features/gomoku/ReadinessControls";
import { RuleInfoTooltip } from "../../features/gomoku/RuleInfoTooltip";
import { GameArtwork } from "./GameArtwork";
import { Avatar, Button, ConfirmDialog, Modal, PageContainer, StatusBadge } from "../../shared/ui";
import "./games.css";

const ruleName = (rule) => (rule === "RENJU" ? "기본 규칙" : "제한 없음");
function GameHeading({ title, children }) {
  return (
    <header className="games-heading">
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </header>
  );
}
function BackLink({ to = "/games", children = "게임방" }) {
  return (
    <Link className="games-back" data-ph-capture-attribute-action="games_back" to={to}>
      <span>
        <ArrowLeft size={16} aria-hidden="true" /> {children}
      </span>
    </Link>
  );
}
function useMemberAction() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  return (target, action) => {
    if (status === "authenticated") return action();
    storeReturnTarget(target);
    if (status === "signup-required") navigate("/signup");
    else if (status === "anonymous") login();
  };
}
// 빼빼로데이 이벤트가 끝나고 게임방으로 옮기는 시각이 지나면 서버가 알려 준 대로 반띵 카드를 보여 준다.
function StickHalvingCard() {
  const status = usePeperoDayStatus();
  if (!status.data?.gameRoomOpen) return null;
  return (
    <article className="games-card games-card--playable">
      <GameArtwork game="stick-halving" className="games-card__visual games-card__visual--stick" />
      <div className="games-card__body">
        <h2>공평하게 반띵</h2>
        <p>막대과자를 정확히 같은 무게로 자르는 퍼즐</p>
        <Link
          className="ui-button ui-button--primary ui-button--md ui-button--block games-card__cta"
          data-ph-capture-attribute-action="stick_halving_room_open"
          to={STICK_HALVING_ROOM_PATH}
        >
          <Gamepad2 size={20} aria-hidden="true" /> 게임 시작
        </Link>
      </div>
    </article>
  );
}

export function GamesPage() {
  return (
    <PageContainer>
      <div className="games-page games-page--catalog">
        <GameHeading title="게임방">잠깐 쉬었다, 한 판 어때요?</GameHeading>
        <div className="games-catalog">
          <article className="games-card games-card--playable">
            <GameArtwork game="gomoku" priority className="games-card__visual" />
            <div className="games-card__body">
              <h2>오목</h2>
              <p>친구와 함께하는 1:1 오목</p>
              <Link
                className="ui-button ui-button--primary ui-button--md ui-button--block games-card__cta"
                data-ph-capture-attribute-action="gomoku_lobby_open"
                to="/games/gomoku"
              >
                <Gamepad2 size={20} aria-hidden="true" /> 게임 시작
              </Link>
            </div>
          </article>
          <StickHalvingCard />
          <article className="games-card games-card--soon" aria-label="리듬게임, 준비 중">
            <GameArtwork game="rhythm" className="games-card__visual" />
            <div className="games-card__body">
              <h2>리듬게임</h2>
              <p>새로운 게임을 준비하고 있어요.</p>
              <Button
                className="games-card__cta"
                block
                disabled
                data-ph-capture-attribute-action="rhythm_game_open"
              >
                준비 중
              </Button>
            </div>
          </article>
        </div>
      </div>
    </PageContainer>
  );
}
export function GomokuLobbyPage() {
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const navigate = useNavigate();
  const memberAction = useMemberAction();
  const [createOpen, setCreateOpen] = useState(false);
  const [visibility, setVisibility] = useState("PUBLIC");
  const [rule, setRule] = useState("RENJU");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const composingSearch = useRef(false);
  const rooms = useQuery({
    queryKey: ["gomoku", "rooms", keyword, cursor],
    queryFn: ({ signal }) => gomokuApi.list(cursor, keyword, signal),
    refetchInterval: 5000
  });
  const mine = useQuery({
    queryKey: ["gomoku", "mine"],
    queryFn: ({ signal }) => gomokuApi.mine(signal),
    enabled: status === "authenticated",
    refetchInterval: 5000
  });
  async function create(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await gomokuApi.create({ visibility, rule });
      await syncGomokuMembership(queryClient, result.roomId);
      navigate(`/games/gomoku/rooms/${result.roomId}`);
    } catch {
      setError("방을 만들지 못했어요. 참여 중인 방이 있는지 확인해 주세요.");
    } finally {
      setPending(false);
    }
  }
  async function join(id) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const current = await mine.refetch({ throwOnError: true });
      if (current.data?.roomId === id) {
        navigate(`/games/gomoku/rooms/${id}`);
        return;
      }
      if (current.data?.roomId != null) {
        setError("이미 참여 중인 방이 있어요. 현재 방에서 나온 뒤 다른 방에 참여해 주세요.");
        return;
      }
      await gomokuApi.join(id);
      await syncGomokuMembership(queryClient, id);
      navigate(`/games/gomoku/rooms/${id}`);
    } catch {
      const current = await mine.refetch();
      if (!current.isError && current.data?.roomId === id) {
        navigate(`/games/gomoku/rooms/${id}`);
        return;
      }
      setError(
        current.data?.roomId != null && !current.isError
          ? "이미 참여 중인 방이 있어요. 현재 방에서 나온 뒤 다른 방에 참여해 주세요."
          : "이미 가득 찼거나 입장할 수 없는 방이에요. 목록을 새로 확인해 주세요."
      );
      void rooms.refetch();
    } finally {
      setPending(false);
    }
  }
  function applySearch(value) {
    setKeyword(value.trim());
    setCursor(null);
    setError("");
  }
  function search(event) {
    event.preventDefault();
    if (!composingSearch.current) applySearch(searchDraft);
  }
  const emptyRooms =
    !keyword && !rooms.isPending && !rooms.isError && rooms.data?.items.length === 0;
  const createButton = (
    <Button
      data-ph-capture-attribute-action="gomoku_room_create_open"
      disabled={status === "loading" || status === "unavailable"}
      onClick={() => memberAction("/games/gomoku", () => setCreateOpen(true))}
    >
      방 만들기
    </Button>
  );
  return (
    <PageContainer>
      <div className="games-page games-page--lobby">
        <header className="games-lobby-heading">
          <div>
            <BackLink />
            <h1>대기실</h1>
          </div>
          <GameArtwork game="gomoku" priority className="games-lobby-heading__art" />
        </header>
        <div className="games-lobby-controls">
          <form
            className="games-search"
            role="search"
            aria-label="대기실 검색"
            onSubmit={search}
            data-ph-capture-attribute-action="gomoku_rooms_search_form"
          >
            <label className="ui-sr-only" htmlFor="gomoku-room-search">
              이름 검색
            </label>
            <div className="games-search__control">
              <input
                id="gomoku-room-search"
                type="search"
                value={searchDraft}
                maxLength={50}
                onChange={(event) => {
                  setSearchDraft(event.target.value);
                  if (!composingSearch.current && !event.nativeEvent.isComposing)
                    applySearch(event.target.value);
                }}
                onCompositionStart={() => {
                  composingSearch.current = true;
                }}
                onCompositionEnd={(event) => {
                  composingSearch.current = false;
                  setSearchDraft(event.currentTarget.value);
                  applySearch(event.currentTarget.value);
                }}
                placeholder="이름으로 검색하기"
                data-ph-capture-attribute-action="gomoku_rooms_search_input"
              />
              <button
                type="submit"
                aria-label="검색"
                data-ph-capture-attribute-action="gomoku_rooms_search_submit"
              >
                <Search size={20} aria-hidden="true" />
              </button>
            </div>
          </form>
          {!emptyRooms && createButton}
        </div>
        {mine.data?.roomId && (
          <aside className="games-own-room" aria-label="참여 중인 자리">
            <span className="games-own-room__icon" aria-hidden="true">
              <Gamepad2 size={22} />
            </span>
            <strong>이미 참여 중인 자리가 있어요.</strong>
            <Link
              className="ui-button ui-button--secondary ui-button--sm games-own-room__link"
              data-ph-capture-attribute-action="gomoku_my_room_open"
              to={`/games/gomoku/rooms/${mine.data.roomId}`}
            >
              돌아가기 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </aside>
        )}
        {error && (
          <p role="alert" className="games-error">
            {error}
          </p>
        )}
        {rooms.isPending ? (
          <p role="status">대기실을 불러오고 있어요.</p>
        ) : rooms.isError ? (
          <div role="alert">
            <p>대기실을 불러오지 못했어요.</p>
            <Button
              variant="secondary"
              data-ph-capture-attribute-action="gomoku_lobby_retry"
              onClick={() => void rooms.refetch()}
            >
              다시 시도
            </Button>
          </div>
        ) : rooms.data.items.length === 0 ? (
          <div className="games-empty">
            <Users size={36} aria-hidden="true" />
            <h3>{keyword ? "검색 결과가 없어요" : "아직 기다리는 방이 없어요"}</h3>
            {keyword ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchDraft("");
                  setKeyword("");
                  setCursor(null);
                  setError("");
                }}
                data-ph-capture-attribute-action="gomoku_rooms_search_reset"
              >
                전체 보기
              </Button>
            ) : (
              createButton
            )}
          </div>
        ) : (
          <ul className="games-room-list">
            {rooms.data.items.map((room) => (
              <li key={room.id}>
                <Avatar
                  alt={`${room.hostName} 프로필`}
                  className="games-room-avatar"
                  fallback={room.hostName?.slice(0, 1) || "?"}
                  size="md"
                  src={room.hostAvatarUrl}
                />
                <div className="games-room-copy">
                  <div className="games-room-title">
                    <h3>{room.hostName}님과의 자리</h3>
                    <StatusBadge tone="brand">상대 대기 중</StatusBadge>
                  </div>
                  <p className="games-room-capacity">
                    <Users size={16} aria-hidden="true" />
                    <span>
                      <span className="ui-sr-only">참가 인원 </span>1 / 2
                    </span>
                    <span className="games-room-rule">{ruleName(room.rule)}</span>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="games-room-join"
                  data-other-room={(mine.data?.roomId != null && mine.data.roomId !== room.id) || undefined}
                  pending={pending}
                  data-ph-capture-attribute-action="gomoku_room_join"
                  onClick={() => memberAction("/games/gomoku", () => join(room.id))}
                >
                  참여하기
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="games-actions">
          {cursor != null && (
            <Button
              variant="secondary"
              data-ph-capture-attribute-action="gomoku_rooms_first"
              onClick={() => setCursor(null)}
            >
              처음으로
            </Button>
          )}
          {rooms.data?.hasNext && (
            <Button
              variant="secondary"
              data-ph-capture-attribute-action="gomoku_rooms_next"
              onClick={() => setCursor(rooms.data.nextCursor)}
            >
              다음 방 보기
            </Button>
          )}
        </div>
        <Modal
          open={createOpen}
          onOpenChange={setCreateOpen}
          dismissible={!pending}
          title="방 만들기"
          panelClassName="games-create-dialog"
          closeAction="gomoku_create_dismiss"
        >
          <form
            className="games-create"
            onSubmit={create}
            data-ph-capture-attribute-action="gomoku_room_create_submit"
          >
            <fieldset className="games-choice-group" disabled={pending}>
              <legend>공개 범위</legend>
              {[
                { value: "PUBLIC", title: "공개", description: "누구나 참여 가능" },
                { value: "PRIVATE", title: "비공개", description: "링크로만 참여 가능" }
              ].map((option) => (
                <label key={option.value} className="games-choice games-choice--visibility">
                  {option.value === "PUBLIC" ? (
                    <Globe size={24} aria-hidden="true" />
                  ) : (
                    <Lock size={24} aria-hidden="true" />
                  )}
                  <input
                    type="radio"
                    name="gomoku-visibility"
                    value={option.value}
                    checked={visibility === option.value}
                    onChange={() => setVisibility(option.value)}
                    data-ph-capture-attribute-action="gomoku_visibility_select"
                  />
                  <span className="games-choice__copy">
                    {option.title}
                    <span>{option.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="games-choice-group" disabled={pending} aria-labelledby="gomoku-rule-label">
              <legend>
                <span className="games-rule-heading">
                  <span id="gomoku-rule-label">대국 규칙</span>
                  <RuleInfoTooltip />
                </span>
              </legend>
              {[
                { value: "RENJU", title: "기본 규칙" },
                { value: "FREESTYLE", title: "제한 없음" }
              ].map((option) => (
                <label key={option.value} className="games-choice games-choice--rule">
                  <input
                    type="radio"
                    name="gomoku-rule"
                    value={option.value}
                    checked={rule === option.value}
                    onChange={() => setRule(option.value)}
                    data-ph-capture-attribute-action="gomoku_rule_select"
                  />
                  <span className="games-choice__copy">{option.title}</span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="games-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              pending={pending}
              data-ph-capture-attribute-action="gomoku_room_create_submit"
            >
              방 만들기
            </Button>
          </form>
        </Modal>
      </div>
    </PageContainer>
  );
}
export function GomokuInvitationPage() {
  const queryClient = useQueryClient();
  const { token } = useParams();
  const navigate = useNavigate();
  const memberAction = useMemberAction();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const preview = useQuery({
    queryKey: ["gomoku", "invitation", token],
    queryFn: () => gomokuApi.preview(token),
    retry: false,
    gcTime: 0
  });
  const joinable = preview.data?.status === "WAITING" && !preview.data?.guestName;
  async function join() {
    setPending(true);
    setError("");
    try {
      await gomokuApi.join(preview.data.id, token);
      await syncGomokuMembership(queryClient, preview.data.id);
      navigate(`/games/gomoku/rooms/${preview.data.id}`, { replace: true });
    } catch {
      setError("초대가 만료되었거나 방이 가득 찼어요. 새 초대를 부탁해 주세요.");
      void preview.refetch();
    } finally {
      setPending(false);
    }
  }
  return (
    <PageContainer>
      <div className="games-page games-invitation ph-no-capture ph-no-record">
        <BackLink to="/games/gomoku">오목 대기실</BackLink>
        <GameHeading title="오목 한 판, 함께해요">친구가 내어 둔 자리에 앉아 보세요.</GameHeading>
        {preview.isPending ? (
          <p role="status">초대를 확인하고 있어요.</p>
        ) : preview.isError ? (
          <p role="alert">유효하지 않거나 만료된 초대예요. 새 링크를 부탁해 주세요.</p>
        ) : (
          <section className="games-rules">
            <h2>{preview.data.hostName}님의 초대</h2>
            <p>
              {ruleName(preview.data.rule)},{" "}
              {preview.data.visibility === "PRIVATE" ? "비공개 방" : "공개 방"}
            </p>
            <p>
              {joinable
                ? "참여 버튼을 누르면 방에 입장해요. 로그인 후에도 직접 참여를 눌러 주세요."
                : "이미 대결 중이거나 참여할 수 없는 방이에요."}
            </p>
            <Button
              disabled={!joinable}
              pending={pending}
              data-ph-capture-attribute-action="gomoku_invitation_join"
              onClick={() => memberAction(`/games/gomoku/invite/${token}`, join)}
            >
              참여하기
            </Button>
          </section>
        )}
        {error && (
          <p role="alert" className="games-error">
            {error}
          </p>
        )}
      </div>
    </PageContainer>
  );
}

export function GomokuRoomPage() {
  const { roomId } = useParams();
  const { member, sessionVersion } = useAuth();
  return <GomokuRoom key={`${roomId}:${member?.id}:${sessionVersion}`} roomId={roomId} />;
}
function GomokuRoom({ roomId }) {
  const queryClient = useQueryClient();
  const { member } = useAuth();
  const navigate = useNavigate();
  const { room, connected, pending, error, act, offset } = useGomokuRoom(roomId);
  const [selected, setSelected] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [notice, setNotice] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const moveAttempt = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  if (!room)
    return (
      <PageContainer>
        <div className="games-page">
          <BackLink to="/games/gomoku">대기실</BackLink>
          <p role={error ? "alert" : "status"}>{error || "게임방에 연결하고 있어요."}</p>
        </div>
      </PageContainer>
    );
  const isHost = member?.id === room.hostMemberId;
  const myReady = isHost ? room.hostReady : room.guestReady;
  const finished = room.status === "FINISHED";
  const closed = room.status === "CLOSED";
  const waiting = room.status === "WAITING";
  const covered = room.status !== "PLAYING";
  const result = closed
    ? "CLOSED"
    : room.winnerMemberId == null
      ? "DRAW"
      : room.winnerMemberId === member?.id
        ? "WIN"
        : "LOSE";
  const currentTurn = turnMemberId(room);
  const myTurn = currentTurn === member?.id;
  const locked = !connected || pending;
  const seconds =
    room.turnDeadline == null
      ? null
      : Math.min(60, Math.max(0, Math.ceil((room.turnDeadline - now - offset.current) / 1000)));
  const canMove = !locked && myTurn && seconds > 0;
  const selectedEmpty =
    selected &&
    selected.gameNumber === room.gameNumber &&
    room.board[selected.y * 15 + selected.x] === "0";
  const colorOf = (id) => (room.blackMemberId === id ? "BLACK" : "WHITE");
  async function place() {
    if (!canMove || !selectedEmpty) return;
    const payload = { gameNumber: room.gameNumber, expectedPly: room.ply, ...selected };
    const signature = JSON.stringify(payload);
    if (moveAttempt.current?.signature !== signature)
      moveAttempt.current = { signature, requestId: moveRequestId() };
    if (
      await act(() =>
        gomokuApi.move(room.id, { ...payload, requestId: moveAttempt.current.requestId })
      )
    ) {
      setSelected(null);
      moveAttempt.current = null;
    }
  }
  function toggleReady() {
    return act(() =>
      gomokuApi.ready(room.id, { ready: !myReady, gameNumber: room.gameNumber + 1 })
    );
  }
  function startGame() {
    return act(() => gomokuApi.start(room.id, room.gameNumber + 1));
  }
  async function copyInvitation() {
    setNotice("");
    let url;
    const ok = await act(async () => {
      const invite = await gomokuApi.invite(room.id);
      url = `${window.location.origin}/games/gomoku/invite/${invite.token}`;
    });
    if (ok) {
      try {
        await navigator.clipboard.writeText(url);
        setNotice("초대 링크를 복사했어요. 새 링크를 만들면 이전 링크는 만료돼요.");
      } catch {
        setNotice("클립보드에 접근할 수 없어요. 아래 링크를 직접 복사해 주세요.");
      }
      setInviteUrl(url);
    }
  }
  // Keep invitation text out of automatic capture and recording.
  return (
    <PageContainer>
      <div className="games-page games-page--room">
        <header className="gomoku-heading">
          <h1 className="ui-sr-only">오목 대국</h1>
          <div className="gomoku-room-navigation">
            <BackLink to="/games/gomoku">대기실</BackLink>
          </div>
          <div className="gomoku-room-toolbar">
            <ul className="gomoku-room-meta" aria-label="방 설정">
              <li>
                <StatusBadge tone="brand">
                  <BookOpen aria-hidden="true" />
                  <span className="ui-sr-only">규칙: </span>
                  {ruleName(room.rule)}
                </StatusBadge>
              </li>
              <li>
                <StatusBadge>
                  {room.visibility === "PUBLIC" ? (
                    <Globe aria-hidden="true" />
                  ) : (
                    <Lock aria-hidden="true" />
                  )}
                  {room.visibility === "PUBLIC" ? "공개방" : "비공개방"}
                </StatusBadge>
              </li>
            </ul>
            <div className="gomoku-tools">
              {room.status === "WAITING" && (
                <Button
                  variant="secondary"
                  disabled={locked}
                  data-ph-capture-attribute-action="gomoku_invitation_copy"
                  onClick={() => void copyInvitation()}
                >
                  <Copy size={16} aria-hidden="true" /> 초대하기
                </Button>
              )}
              {room.status === "PLAYING" && (
                <Button
                  variant="secondary"
                  disabled={locked}
                  data-ph-capture-attribute-action="gomoku_resign_open"
                  onClick={() => setConfirmation("resign")}
                >
                  기권하기
                </Button>
              )}
              {!closed && (
                <Button
                  variant="danger"
                  disabled={pending}
                  data-ph-capture-attribute-action="gomoku_leave_open"
                  onClick={() => setConfirmation("leave")}
                >
                  나가기
                </Button>
              )}
            </div>
          </div>
        </header>
        {error && (
          <p role="alert" className="games-error">
            {error}
          </p>
        )}
        <InvitationLink notice={notice} url={inviteUrl} />
        <section className={`gomoku-arena${waiting ? " gomoku-arena--waiting" : ""}`} aria-label="오목 대국">
          <ul className="gomoku-players">
            {[
              {
                id: room.hostMemberId,
                name: room.hostName,
                ready: room.hostReady,
                avatarUrl: room.hostAvatarUrl
              },
              {
                id: room.guestMemberId,
                name: room.guestName,
                ready: room.guestReady,
                avatarUrl: room.guestAvatarUrl
              }
            ].map((player, index) => (
              <li
                key={index}
                className={
                  room.status === "PLAYING" && currentTurn === player.id
                    ? "gomoku-player--active"
                    : undefined
                }
              >
                <span className="gomoku-player-avatar">
                  {player.id ? (
                    <>
                      <Avatar
                        alt={`${player.name} 프로필`}
                        fallback={player.name?.slice(0, 1) || "?"}
                        size="sm"
                        src={player.avatarUrl}
                      />
                      {room.gameNumber > 0 && (
                        <span
                          className="gomoku-player-color"
                          role="img"
                          aria-label={colorOf(player.id) === "BLACK" ? "흑돌" : "백돌"}
                        >
                          <Stone color={colorOf(player.id)} />
                        </span>
                      )}
                    </>
                  ) : (
                    <Users aria-hidden="true" size={20} />
                  )}
                </span>
                <div>
                  <strong>
                    {player.name || "빈 자리"}
                    {player.id === member?.id ? " (나)" : ""}
                  </strong>
                  <span
                    className={
                      (waiting || finished) && player.id
                        ? `gomoku-readiness--${player.ready ? "ready" : "unready"}`
                        : undefined
                    }
                  >
                    {room.status === "PLAYING"
                      ? currentTurn === player.id
                        ? "두는 중"
                        : "대기"
                      : room.status === "CLOSED"
                        ? player.id && room.gameNumber > 0
                          ? colorOf(player.id) === "BLACK"
                            ? "흑돌"
                            : "백돌"
                          : "대기"
                        : player.id
                          ? player.ready
                            ? "준비 완료"
                            : "준비 전"
                          : "참여 대기"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {room.status === "PLAYING" && (
            <div className="gomoku-status-row">
              <h2 className="gomoku-state" aria-live="polite">
                {myTurn ? "내 차례예요" : "상대 차례예요"}
              </h2>
              {room.status === "PLAYING" && (
                <div
                  className={`gomoku-clock${seconds <= 10 ? " gomoku-clock--urgent" : ""}`}
                  aria-label={`남은 시간 ${seconds}초`}
                >
                  <Clock3 size={16} aria-hidden="true" />
                  <strong>{seconds}</strong>
                  <span>초</span>
                </div>
              )}
            </div>
          )}
          <div className="gomoku-board-slot">
            <div className={`gomoku-table${covered ? " gomoku-table--covered" : ""}`}>
              <div className="gomoku-board-surface" inert={covered || undefined}>
                <Board
                  room={room}
                  selected={selectedEmpty ? selected : null}
                  onSelect={(position) => setSelected({ ...position, gameNumber: room.gameNumber })}
                  disabled={!canMove}
                />
              </div>
              {covered && (
                <div className="gomoku-result">
                  <div className="gomoku-result__content">
                    {waiting ? (
                      <h2 className="gomoku-preparation-title">대국 준비</h2>
                    ) : (
                      <div role="status">
                        <h3
                          className={`gomoku-result__title gomoku-result__title--${result.toLowerCase()}`}
                          lang="en"
                          aria-label={closed ? "종료된 방" : result}
                        >
                          {result.split("").map((letter, index) => (
                            <span
                              key={index}
                              aria-hidden="true"
                              className="gomoku-result__letter"
                              style={{ "--letter-index": index }}
                            >
                              {letter}
                            </span>
                          ))}
                        </h3>
                      </div>
                    )}
                    {closed ? (
                      <Button
                        block
                        data-ph-capture-attribute-action="gomoku_closed_lobby_open"
                        onClick={() => navigate("/games/gomoku")}
                      >
                        대기실로
                      </Button>
                    ) : (
                      <ReadinessControls
                        room={room}
                        isHost={isHost}
                        myReady={myReady}
                        locked={locked}
                        pending={pending}
                        onReady={toggleReady}
                        onStart={startGame}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {room.status === "PLAYING" && (
            <footer className="gomoku-controls">
              <Button
                disabled={!canMove || !selectedEmpty}
                pending={pending}
                data-ph-capture-attribute-action="gomoku_move_confirm"
                onClick={() => void place()}
              >
                자리하기
              </Button>
            </footer>
          )}
        </section>
        <ConfirmDialog
          open={Boolean(confirmation)}
          pending={pending}
          onClose={() => setConfirmation(null)}
          title={confirmation === "resign" ? "기권할까요?" : "방에서 나갈까요?"}
          description={
            room.status === "PLAYING"
              ? "대결 중 기권하거나 나가면 패배로 기록돼요."
              : isHost || room.status === "FINISHED"
                ? "방을 나가면 방이 종료돼요."
                : "방을 나가면 다시 참여해야 해요."
          }
          danger
          actionsClassName="gomoku-confirm-actions"
          confirmLabel={confirmation === "resign" ? "기권하기" : "확인"}
          cancelAction="gomoku_confirmation_cancel"
          closeAction="gomoku_confirmation_dismiss"
          confirmAction={
            confirmation === "resign" ? "gomoku_resign_confirm" : "gomoku_leave_confirm"
          }
          onConfirm={async () => {
            if (confirmation === "resign") {
              if (!(await act(() => gomokuApi.resign(room.id, room.gameNumber))))
                throw new Error("resign failed");
            } else {
              await gomokuApi.leave(room.id);
              await syncGomokuMembership(queryClient, null);
              navigate("/games/gomoku", { replace: true });
            }
          }}
        />
      </div>
    </PageContainer>
  );
}
function InvitationLink({ notice, url }) {
  return (
    <div className="ph-no-capture ph-no-record">
      {notice && (
        <p role="status" className="games-help">
          {notice}
        </p>
      )}
      {url && (
        <label className="games-invite-link">
          초대 링크
          <input
            readOnly
            value={url}
            data-ph-capture-attribute-action="gomoku_invitation_link_select"
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
    </div>
  );
}
