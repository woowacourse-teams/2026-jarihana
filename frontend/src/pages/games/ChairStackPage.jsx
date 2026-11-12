import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trophy } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../features/auth";
import { chairStackApi } from "../../features/chair-stack/api";
import { ChairStackBoard } from "../../features/chair-stack/ChairStackBoard";
import { ChairStackSky } from "../../features/chair-stack/ChairStackSky";
import { clampAim } from "../../features/chair-stack/motion";
import { playbackDuration } from "../../features/chair-stack/physicsBoard";
import { Button, ConfirmDialog, Modal, PageContainer } from "../../shared/ui";
import "./chair-stack.css";

const rankingKey = ["chair-stack", "rankings"];
const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const normalizeName = (value) => value.trim().normalize("NFC");
const guestName = /^[가-힣A-Za-z0-9 ]{2,12}$/;

function normalizeAngle(degrees) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

function Ranking({ open, onClose, viewer }) {
  const query = useInfiniteQuery({
    queryKey: [...rankingKey, viewer],
    queryFn: ({ pageParam, signal }) => chairStackApi.rankings(pageParam, signal),
    initialPageParam: null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: open
  });
  const pages = query.data?.pages ?? [];
  const me = pages[0]?.me;
  return (
    <Modal title="전체 랭킹" open={open} onClose={onClose} closeAction="chair_stack_rankings_close">
      {me ? <p className="chair-stack-rankings__me">내 순위 <strong>{me.rank}위</strong> / {me.score}개</p> : null}
      {query.isPending && <p role="status">랭킹을 불러오는 중이에요.</p>}
      {query.isError && (
        <div role="alert">
          <p>랭킹을 불러오지 못했어요.</p>
          <Button variant="secondary" onClick={() => void query.refetch()}
            data-ph-capture-attribute-action="chair_stack_rankings_retry">다시 불러오기</Button>
        </div>
      )}
      {pages[0]?.items.length === 0 && <p>아직 등록된 기록이 없어요.</p>}
      <ul className="chair-stack-rankings">
        {pages.flatMap((page, pageIndex) => page.items.map((entry, index) => (
          <li key={`${pageIndex}:${index}`} className="chair-stack-rankings__row">
            <span>{entry.rank}위</span>
            <span className="chair-stack-rankings__name" data-ph-private>
              {entry.nickname}{entry.guest && <small>게스트</small>}
            </span>
            <strong>{entry.score}개</strong>
          </li>
        )))}
      </ul>
      {query.hasNextPage && (
        <Button block variant="secondary" pending={query.isFetchingNextPage}
          data-ph-capture-attribute-action="chair_stack_rankings_more"
          onClick={() => void query.fetchNextPage()}>더 보기</Button>
      )}
    </Modal>
  );
}

function GameStats({ run, best }) {
  return (
    <dl className="chair-stack-stats">
      <div><dt>쌓은 의자</dt><dd aria-live="polite">{run?.placements.length ?? 0}개</dd></div>
      <div><dt>내 최고 기록</dt><dd>{best ? `${best}개` : "—"}</dd></div>
    </dl>
  );
}

export function ChairStackPage() {
  const auth = useAuth();
  const viewer = `${auth.sessionVersion ?? 0}:${auth.member?.id ?? auth.status}`;
  return <ChairStackGame key={viewer} viewer={viewer} member={auth.status === "authenticated"}
    ready={auth.status !== "loading"} />;
}

function ChairStackGame({ viewer, member, ready }) {
  const client = useQueryClient();
  const stateKey = ["chair-stack", "current", viewer];
  const current = useQuery({
    queryKey: stateKey,
    queryFn: async ({ signal }) => {
      const snapshot = await chairStackApi.current(member, signal);
      if (!member || snapshot.run) return snapshot;
      return chairStackApi.start({
        member: true, nickname: null, previousRunId: null, requestId: crypto.randomUUID()
      });
    },
    enabled: ready,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const state = current.data;
  const run = state?.run;
  const [aim, setAim] = useState(0);
  const [adjustment, setAdjustment] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showRanking, setShowRanking] = useState(false);
  const [dismissedResult, setDismissedResult] = useState(null);
  const [operation, setOperation] = useState(null);
  const [notice, setNotice] = useState("");
  const [collapse, setCollapse] = useState(null);
  const [replay, setReplay] = useState(null);
  const sending = useRef(false);
  const phaseOrigin = useRef(null);
  const resultTrigger = useRef(null);

  const period = run?.motion.periodMs;
  const phaseAt = useCallback((now) => {
    if (!period) return 0;
    phaseOrigin.current ??= now;
    return Math.floor(Math.max(0, now - phaseOrigin.current) % period);
  }, [period]);

  const nickname = draft ?? state?.nickname ?? "";
  const busy = operation?.pending ?? false;
  const orientation = run?.toyMode ? run.active?.orientation ?? 0 : 0;
  const physicsPiece = run?.physics?.active;
  const angleDegrees = adjustment?.angleDegrees
    ?? normalizeAngle(Math.round(-(physicsPiece?.angle ?? 0) * 180 / Math.PI));
  const mirrored = adjustment?.mirrored ?? physicsPiece?.mirror ?? false;
  const resultOpen = Boolean(run?.finished && run.id !== dismissedResult && !showRanking);

  async function send(request) {
    if (sending.current) return;
    sending.current = true;
    setNotice("");
    const active = request.drop ? { ...request, drop: { ...request.drop, at: performance.now() } } : request;
    setOperation({ ...active, pending: true });
    try {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const next = active.drop
        ? (await Promise.all([
            chairStackApi.drop(active.payload),
            pause(reduceMotion || run?.physics ? 0 : active.drop.motion.fallMs)
          ]))[0]
        : await chairStackApi.start(active.payload);
      const duration = playbackDuration(next.frames);
      if (run?.physics && duration && !reduceMotion) {
        setReplay({ frames: next.frames, duration, startedAt: performance.now() });
        await pause(duration);
        setReplay(null);
      }
      const nextRun = next.run;
      if (active.drop && nextRun?.failedLayer && !nextRun.physics) {
        setCollapse({ ...active.drop, at: performance.now() });
      } else {
        setCollapse(null);
      }
      const phaseRatio = active.drop && !run?.physics
        ? ((active.payload.phaseMs + active.drop.motion.fallMs) % active.drop.motion.periodMs)
            / active.drop.motion.periodMs
        : 0;
      phaseOrigin.current = performance.now() - phaseRatio * (nextRun?.motion.periodMs ?? 0);
      if (!active.drop) setAim(0);
      setAdjustment(null);
      client.setQueryData(stateKey, { ...next, frames: [] });
      if (nextRun?.finished) void client.invalidateQueries({ queryKey: rankingKey });
      setOperation(null);
    } catch (error) {
      if (error.code === "CONCURRENT_MODIFICATION" || error.code === "CHAIR_STACK_RUN_NOT_FOUND") {
        setOperation(null);
        setCollapse(null);
        setAdjustment(null);
        phaseOrigin.current = null;
        await current.refetch();
        setNotice("게임이 다른 화면에서 바뀌었거나 만료됐어요. 최신 상태를 다시 불러왔어요.");
      } else if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        setOperation(null);
        if (error.status === 429) {
          setNotice("잠시 후 다시 시작해 주세요.");
        } else if (!active.drop && error.status === 400) {
          setNotice("닉네임과 브라우저 쿠키 설정을 확인해 주세요.");
        } else {
          setNotice("요청을 처리하지 못했어요. 다시 시도해 주세요.");
        }
      } else {
        setOperation({ ...active, pending: false });
        setNotice("연결이 끊겼어요. 같은 요청을 다시 보낼 수 있어요.");
      }
    } finally {
      sending.current = false;
    }
  }

  function start(event) {
    event?.preventDefault();
    if (!state || operation || sending.current) return;
    const name = state.guest ? normalizeName(nickname) : null;
    if (state.guest && !guestName.test(name)) {
      setNotice("닉네임은 한글, 영문, 숫자, 공백으로 2~12자예요.");
      return;
    }
    return send({
      payload: { member: !state.guest, nickname: name, previousRunId: run?.id ?? null, requestId: crypto.randomUUID() }
    });
  }

  function drop() {
    if (!run?.active || operation || sending.current) return;
    const phaseMs = phaseAt(performance.now());
    void send({
      payload: {
        member: !state.guest, runId: run.id, turn: run.placements.length, x: aim, requestId: crypto.randomUUID(),
        ...(run.physics ? (adjustment ? { adjustment } : {}) : { phaseMs })
      },
      drop: { chair: run.active, x: aim, orientation, phaseMs, motion: run.motion }
    });
  }

  function changeAim(value) {
    if (!operation) setAim(clampAim(value));
  }

  function flipChair(vertical) {
    setAdjustment({
      angleDegrees: normalizeAngle((vertical ? 180 : 0) - angleDegrees),
      mirrored: !mirrored
    });
  }

  const requestNotice = notice && (
    <div className="chair-stack-notice" role="alert">
      <p>{notice}</p>
      {operation && !busy && (
        <Button variant="secondary" onClick={() => void send(operation)}
          data-ph-capture-attribute-action="chair_stack_request_retry">다시 보내기</Button>
      )}
    </div>
  );

  return (
    <PageContainer>
      <div className={run?.active ? "chair-stack chair-stack--playing" : "chair-stack"}>
        <Link className="chair-stack-back" to="/games" data-ph-capture-attribute-action="games_back">
          <ArrowLeft size={16} aria-hidden="true" /> 게임방
        </Link>
        <header className="chair-stack-heading">
          <h1>의자 쌓기</h1>
          <Button variant="secondary" onClick={() => setShowRanking(true)} aria-haspopup="dialog"
            data-ph-capture-attribute-action="chair_stack_rankings_open">
            <Trophy size={16} aria-hidden="true" /> 전체 랭킹
          </Button>
        </header>
        {state && <GameStats run={run} best={state.bestScore} />}
        <div className="chair-stack-stage">
          <ChairStackSky run={run} />
          <ChairStackBoard run={run} aim={aim} orientation={orientation} adjustment={adjustment} onAim={changeAim} onDrop={drop}
            disabled={!!operation} phaseAt={phaseAt}
            drop={busy && !run?.physics ? operation?.drop : null} collapse={collapse} replay={replay} />
          {!run && (
            <div className="chair-stack-start">
              {current.isPending && <p role="status">게임을 불러오는 중이에요.</p>}
              {current.isError && (
                <>
                  <p role="alert">게임을 불러오지 못했어요.</p>
                  <Button onClick={() => void current.refetch()}
                    data-ph-capture-attribute-action="chair_stack_current_retry">다시 불러오기</Button>
                </>
              )}
              {state?.guest && (
                <form onSubmit={start} className="chair-stack-start__form"
                  data-ph-capture-attribute-action="chair_stack_start_form">
                  <label data-ph-private>
                    닉네임
                    <input value={nickname} onChange={(event) => setDraft(event.target.value)} maxLength={12}
                      autoComplete="off" disabled={!!operation} aria-describedby="chair-stack-public-name"
                      data-ph-capture-attribute-action="chair_stack_nickname_input" />
                  </label>
                  <p id="chair-stack-public-name">닉네임과 최고 기록은 전체 랭킹에 공개돼요.</p>
                  <Button size="lg" block type="submit" pending={busy} disabled={!!operation}
                    data-ph-capture-attribute-action="chair_stack_start">시작하기</Button>
                </form>
              )}
            </div>
          )}
        </div>

        {!resultOpen && requestNotice}

        {run?.active && (
          <>
            <div className="chair-stack-controls">
              <Button size="lg" block pending={busy} disabled={!!operation}
                data-ph-capture-attribute-action="chair_stack_drop" onClick={drop}>놓기</Button>
            </div>
            {physicsPiece && (
              <div className="chair-stack-adjustment">
                <label className="chair-stack-rotation">
                  <span>의자 회전 <output aria-hidden="true">{angleDegrees}°</output></span>
                  <input type="range" min={-180} max={180} step={1} value={angleDegrees}
                    aria-label="의자 회전" aria-valuetext={`${angleDegrees}도`} disabled={!!operation}
                    data-ph-capture-attribute-action="chair_stack_rotate"
                    onChange={(event) => setAdjustment({ angleDegrees: Number(event.target.value), mirrored })} />
                </label>
                <div className="chair-stack-flips">
                  <Button size="sm" variant="secondary" disabled={!!operation}
                    data-ph-capture-attribute-action="chair_stack_flip_horizontal" onClick={() => flipChair(false)}>좌우 반전</Button>
                  <Button size="sm" variant="secondary" disabled={!!operation}
                    data-ph-capture-attribute-action="chair_stack_flip_vertical" onClick={() => flipChair(true)}>상하 반전</Button>
                </div>
              </div>
            )}
            <div className="chair-stack-hint">
              <ConfirmDialog title="처음부터 다시 시작할까요?" description="진행 중인 판의 점수는 랭킹에 저장되지 않아요."
                confirmLabel="다시하기" confirmAction="chair_stack_restart_confirm"
                cancelAction="chair_stack_restart_cancel" closeAction="chair_stack_restart_close" onConfirm={() => start()}
                trigger={<Button variant="ghost" size="sm" disabled={!!operation}
                  data-ph-capture-attribute-action="chair_stack_restart_open">다시하기</Button>} />
            </div>
          </>
        )}

        {run?.finished && (
          <>
            <div className="chair-stack-hint">
              <Button ref={resultTrigger} variant="secondary" aria-haspopup="dialog"
                data-ph-capture-attribute-action="chair_stack_result_open"
                onClick={() => setDismissedResult(null)}>게임 결과 보기</Button>
            </div>
            <Modal open={resultOpen} panelClassName="chair-stack-result"
              title={run.failedLayer == null ? "100개 완주!" : `${run.placements.length}개를 쌓았어요`}
              closeAction="chair_stack_result_close"
              onClose={() => {
                setDismissedResult(run.id);
                resultTrigger.current?.focus({ preventScroll: true });
              }}>
              {requestNotice}
              <Button size="lg" block onClick={() => void start()} pending={busy} disabled={!!operation}
                data-ph-capture-attribute-action="chair_stack_replay">다시 도전</Button>
            </Modal>
          </>
        )}
        <Ranking open={showRanking} onClose={() => setShowRanking(false)} viewer={viewer} />
      </div>
    </PageContainer>
  );
}
