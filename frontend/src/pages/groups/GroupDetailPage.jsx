import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, Home, Image, MapPin, Megaphone, MessageCircle, Plus, Settings, Share2, Users } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import {
  compareMemberCohortKeys,
  memberCohortKey,
  memberCohortLabel,
  nonCrewMemberTypeLabel
} from "../../entities/member/index.js";
import { useAuth } from "../../features/auth/index.js";
import { ChatLink } from "../../features/chat/ChatLink";
import { useGroup } from "../../features/group/index.js";
import { clearPendingClubhouseSetup, hasPendingClubhouseSetup } from "../../features/group-space/setupProgress.js";
import GroupClubhouse, { GroupPhotoDetail } from "./GroupClubhouse.jsx";
import { GroupAnnouncementTab } from "./GroupAnnouncementTab.jsx";
import { GroupRecentActivities, GroupScheduleSummary } from "./GroupDetailOverview.jsx";
import { useInfiniteGroupMembers } from "../../features/member/index.js";
import { InviteMembersDialog } from "../../features/invitation/InviteMembersDialog.jsx";
import { ShareInvitationButton } from "../../features/invitation/ShareInvitationButton.jsx";
import {
  useCreateRegistration,
  useWithdrawRegistration
} from "../../features/registration/index.js";
import { ActivityPostBoard } from "../activity-posts/ActivityPostBoard.jsx";
import { GroupCalendarTab } from "./GroupCalendarTab.jsx";
import { toUserMessage } from "../../shared/api/index.js";
import { captureEvent, getPromotionAttribution } from "../../shared/analytics/index.js";
import recruitmentEmptyIllustration from "../../shared/assets/illustrations/group-recruitment-empty.webp";
import recruitmentOpenIllustration from "../../shared/assets/illustrations/group-recruitment-open.webp";
import {
  Avatar,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  PageContainer,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
  useToast
} from "../../shared/ui/index.js";
import { MarkdownContent } from "../../shared/ui/MarkdownContent.jsx";
import {
  flattenPages,
  formatCompactLocalDateTime,
  memberMetaLabel,
  meetingTypeLabel,
  publicErrorCopy,
  recruitmentCountdownLabel,
  scheduleLines
} from "./pageUtils.js";
import { groupTransitionOrigin, isPlainLinkClick } from "./GroupTransition.jsx";
import "./groups.css";
import "./group-detail-web.css";

const tabs = [
  { label: "소개", value: "intro", icon: Home, dataAction: "group_info_open" },
  { label: "공지사항", value: "announcements", icon: Megaphone, dataAction: "group_announcement_tab_open" },
  { label: "일정", value: "calendar", icon: CalendarDays, dataAction: "group_schedule_open" },
  { label: "활동 기록", value: "activities", icon: Image, dataAction: "group_activities_open" },
  { label: "참여자", value: "members", icon: Users, dataAction: "space_members_open" }
];

/* 도착한 화면을 먼저 보여 준 뒤 묻는 정도의 짧은 간격이다. */
const RECRUITMENT_PROMPT_DELAY = 500;

export function GroupDetailPage() {
  const { groupId } = useParams();
  const auth = useAuth();
  const memberId = (auth.member ?? auth.user)?.id;
  return <GroupDetail key={`${groupId}:${memberId ?? "guest"}`} auth={auth} groupId={groupId} memberId={memberId} />;
}

function GroupDetail({ auth, groupId, memberId }) {
  const location = useLocation();
  const navigate = useNavigate();
  const origin = groupTransitionOrigin(location.state);
  const justCreatedReference = useRef(location.state?.justCreated === true);
  const toast = useToast();
  const [recruitmentPromptOpen, setRecruitmentPromptOpen] = useState(false);
  const [offerSetup, setOfferSetup] = useState(() => (
    location.state?.justCreated === true || hasPendingClubhouseSetup(groupId, memberId)
  ));
  const [invitationOpenScope, setInvitationOpenScope] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = tabs.some((tab) => tab.value === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "intro";
  const groupQuery = useGroup(groupId);
  const group = groupQuery.data;
  const loadedGroupId = group?.id;
  const photoDetail = group?.type === "SESSION";
  const redirectSpace = photoDetail && /\/space\/?$/i.test(location.pathname);
  const isLeader = Boolean(memberId && memberId === group?.leader?.memberId);
  const isApprovedMember =
    group?.currentMemberRole === "MEMBER" || group?.currentMemberRole === "LEADER";
  const hasExistingRegistration = group?.currentMemberRegistrationStatus != null;
  const isArchived = group?.status === "ENDED";
  const canInvite = auth.status === "authenticated" && isApprovedMember && !isArchived;
  const invitationScope = `${groupId}:${memberId ?? "guest"}:${auth.sessionVersion ?? 0}`;
  const setupPending = offerSetup && isLeader && !isArchived && !photoDetail;

  useEffect(() => {
    if (loadedGroupId && !redirectSpace && !setupPending && !recruitmentPromptOpen) {
      document.getElementById("group-title")?.focus({ preventScroll: true });
    }
  }, [loadedGroupId, recruitmentPromptOpen, redirectSpace, setupPending]);

  /* 세션은 아지트가 없어서 상세 화면이 열린 뒤 바로 모집을 안내한다. */
  useEffect(() => {
    if (!photoDetail || redirectSpace || !justCreatedReference.current || !memberId) return;
    justCreatedReference.current = false;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    if (!isLeader || isArchived || group.activeRecruitment) return;
    const timer = setTimeout(() => setRecruitmentPromptOpen(true), RECRUITMENT_PROMPT_DELAY);
    return () => clearTimeout(timer);
  }, [group, isArchived, isLeader, location.pathname, location.search, memberId, navigate, photoDetail, redirectSpace]);

  if (groupQuery.isLoading) {
    return (
      <PageContainer className="group-detail-page">
        <Skeleton className="group-detail-skeleton" />
      </PageContainer>
    );
  }

  if (groupQuery.isError || !group) {
    const copy = publicErrorCopy(groupQuery.error, "모임");
    return (
      <PageContainer className="group-detail-page">
        <ErrorState
          title={copy.title}
          description={copy.description}
          action={
            copy.retryable ? (
              <Button onClick={() => groupQuery.refetch?.()}>다시 시도</Button>
            ) : (
              <Link className="ui-button ui-button--primary ui-button--md" to="/groups">
                <span>모임 목록으로</span>
              </Link>
            )
          }
        />
      </PageContainer>
    );
  }

  if (redirectSpace) {
    return <Navigate replace state={location.state}
      to={{ pathname: `/groups/${groupId}`, search: location.search, hash: location.hash }} />;
  }

  function completeSetup() {
    clearPendingClubhouseSetup(groupId, memberId);
    setOfferSetup(false);
    if (location.state?.justCreated) {
      navigate(`${location.pathname}${location.search}${location.hash ?? ""}`, { replace: true, state: null });
    }
    if (!group.activeRecruitment) setRecruitmentPromptOpen(true);
  }

  function selectTab(value) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    if (value !== "activities") next.delete("post");
    setSearchParams(next, { replace: true, state: location.state, preventScrollReset: true });
  }

  async function shareGroup() {
    try {
      await navigator.clipboard.writeText(new URL(`/groups/${group.id}`, window.location.origin).href);
      toast.success({ title: "모임 링크를 복사했어요." });
    } catch {
      toast.danger({ title: "링크를 복사하지 못했어요. 주소창의 모임 주소를 복사해 주세요." });
    }
  }

  const recruitmentProps = {
    auth, group, hasExistingRegistration, isApprovedMember, isArchived, isLeader,
    createRecruitmentHref: isLeader ? `/groups/${groupId}/manage/recruitments` : null
  };
  const toolbar = <div className="group-detail-web__actions">
    {auth.status === "authenticated" && isApprovedMember && (
      <ChatLink roomId={group.id} aria-label="모임 채팅" title="모임 채팅" data-ph-capture-attribute-action="group_chat_open">
        <MessageCircle size={20} aria-hidden="true" />
      </ChatLink>
    )}
    <button type="button" aria-label="모임 링크 복사" title="모임 링크 복사" data-ph-capture-attribute-action="group_share"
      onClick={shareGroup}><Share2 size={19} aria-hidden="true" /></button>
    {canInvite && <ShareInvitationButton key={invitationScope} groupId={groupId} />}
    {isLeader && <Link to={`/groups/${groupId}/manage`} aria-label="모임 수정" title="모임 수정"
      data-ph-capture-attribute-action="group_edit"><Settings size={20} aria-hidden="true" /></Link>}
    <div className="group-recruitment-entry">
      <Modal closeAction="group_recruitment_info_dismiss" title="모집 정보"
        trigger={<Button data-ph-capture-attribute-action="recruitment_details_open"><Users size={19} aria-hidden="true" />모집 정보</Button>}>
        <div className="group-recruitment-modal"><RecruitmentSummary {...recruitmentProps} /></div>
      </Modal>
    </div>
  </div>;

  const tabContent = {
    intro: <Introduction group={group} />,
    calendar: <GroupCalendarTab groupId={groupId} groupType={group.type} isLeader={isLeader && !isArchived}
      isMember={isApprovedMember} sessionSchedule={group.sessionSchedule} />,
    activities: <ActivityPostBoard group={group} />,
    members: <MemberTab groupId={groupId} leader={group.leader} canInvite={canInvite} onInvite={() => setInvitationOpenScope(invitationScope)} />,
    announcements: <GroupAnnouncementTab group={group} isLeader={isLeader} />
  };
  const detail = (
    <div className="group-detail-web">
      <Tabs value={selectedTab} onValueChange={selectTab} actions={toolbar}
        items={tabs.map(({ icon: Icon, label, value, dataAction }) => ({
          label: <><Icon size={20} aria-hidden="true" />{label}</>, value, dataAction,
          content: selectedTab === value ? <div className="group-detail-web__grid" data-overview={value === "intro"}>
            <div className="group-detail-web__main">{tabContent[value]}</div>
            {value === "intro" && <GroupRecentActivities auth={auth} groupId={groupId} onOpenActivities={() => selectTab("activities")} />}
            <aside className="group-detail-web__rail" aria-label="모집 정보와 일정">
              <RecruitmentSummary {...recruitmentProps} compact />
              <GroupScheduleSummary group={group} onOpenSchedule={() => selectTab("calendar")} />
            </aside>
          </div> : null
        }))} />
      <Link className="group-detail-web__back" data-ph-capture-attribute-action="group_list_return" to={origin ?? "/groups"} viewTransition
        onClick={(event) => {
          if (!origin || !isPlainLinkClick(event)) return;
          event.preventDefault();
          navigate(-1);
        }}>
        <ChevronLeft aria-hidden="true" size={18} />목록으로
      </Link>

      {canInvite ? <InviteMembersDialog key={invitationScope} groupId={groupId} open={invitationOpenScope === invitationScope} onClose={() => setInvitationOpenScope(null)} /> : null}

      <Modal
        closeAction="recruitment_start_prompt_dismiss"
        description="모집을 시작해야 다른 사람이 이 모임에 신청할 수 있어요."
        onClose={() => setRecruitmentPromptOpen(false)}
        open={recruitmentPromptOpen}
        title="모집을 시작할까요?"
      >
        <div className="ui-dialog__actions">
          <Button data-ph-capture-attribute-action="recruitment_start_later" onClick={() => setRecruitmentPromptOpen(false)} variant="secondary">
            나중에 하기
          </Button>
          <Button
            data-ph-capture-attribute-action="recruitment_start"
            onClick={() =>
              navigate(`/groups/${groupId}/manage/recruitments`, { state: { screen: "create" } })
            }
            variant="primary"
          >
            모집 시작하기
          </Button>
        </div>
      </Modal>
    </div>
  );
  if (photoDetail) return <GroupPhotoDetail group={group}>{detail}</GroupPhotoDetail>;

  return (
    <GroupClubhouse
      auth={auth}
      group={group}
      groupId={groupId}
      isMember={Boolean(memberId && (isApprovedMember || isLeader))}
      key={invitationScope}
      setup={setupPending ? { onComplete: completeSetup, onDismiss: () => setOfferSetup(false) } : undefined}
    >
      {detail}
    </GroupClubhouse>
  );
}

function Introduction({ group }) {
  return <section className="group-introduction" aria-labelledby="group-detail-intro-title">
    <h2 id="group-detail-intro-title">모임 소개</h2>
    <MarkdownContent value={group.description || group.introduction} />
    <dl className="group-detail-web__facts">
      <div><dt><CalendarDays size={19} aria-hidden="true" />활동 일정</dt>
        <dd>{scheduleLines(group).map((line) => <span key={line}>{line}</span>)}</dd></div>
      <div><dt><MapPin size={19} aria-hidden="true" />모임 장소</dt><dd>{group.location || "아직 정해지지 않았어요"}</dd></div>
      <div><dt><Users size={19} aria-hidden="true" />모임 방식</dt><dd>{meetingTypeLabel(group.meetingType)}</dd></div>
    </dl>
    <LeaderSummary leader={group.leader} variant="card" />
  </section>;
}

function RecruitmentSummary({
  auth,
  createRecruitmentHref,
  group,
  hasExistingRegistration,
  isApprovedMember,
  isArchived,
  isLeader,
  compact = false
}) {
  const recruitment = group.activeRecruitment;
  const className = `group-recruitment-summary group-rail-card${compact ? " group-recruitment-summary--compact" : ""}`;
  const registration = useCreateRegistration(recruitment?.id, group.id);
  const withdrawal = useWithdrawRegistration(recruitment?.id);
  const toast = useToast();
  const registrationStartedReference = useRef();
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isAuthenticated = auth.status === "authenticated" || auth.isAuthenticated;
  const remainingSeats = recruitment
    ? Math.max(recruitment.capacity - recruitment.approvedCount, 0)
    : 0;
  const isOpen = Boolean(recruitment && remainingSeats > 0);

  if (isArchived) {
    return (
      <section className={className}>
        <div className="group-recruitment-empty">
          <h3>아카이빙된 모임입니다</h3>
        </div>
      </section>
    );
  }

  function openApplication() {
    registration.reset();
    const flowKey = `${group.id}:${recruitment?.id ?? "none"}`;
    if (registrationStartedReference.current !== flowKey) {
      registrationStartedReference.current = flowKey;
      const promotionId = getPromotionAttribution(group.id)?.promotion_id;
      captureEvent("registration_started", {
        group_id: group.id,
        recruitment_id: recruitment?.id,
        ...(promotionId ? { attribution_promotion_id: promotionId } : {})
      });
    }
    setApplicationOpen(true);
  }

  function applicationAction() {
    if (group.currentMemberRegistrationStatus === "PENDING" && isOpen) {
      if (group.currentMemberRegistrationId == null) {
        return (
          <Link
            className="ui-button ui-button--danger ui-button--md"
            data-ph-capture-attribute-action="registration_withdraw"
            to="/my/registrations"
          >
            내 신청에서 철회
          </Link>
        );
      }
      return (
        <ConfirmDialog
          closeAction="registration_withdraw_confirm_dismiss"
          cancelAction="registration_withdraw_cancel"
          confirmAction="registration_withdraw_confirm"
          confirmLabel="철회하기"
          danger
          description="철회한 신청은 되돌릴 수 없어요. 다시 참여하려면 모집이 열려 있을 때 새로 신청해야 해요."
          onConfirm={async () => {
            await withdrawal.mutateAsync(group.currentMemberRegistrationId);
            setSubmitted(false);
            toast.success({ title: "신청을 철회했어요" });
          }}
          pending={withdrawal.isPending}
          title="신청을 철회할까요?"
          trigger={
            <Button
              data-ph-capture-attribute-action="registration_withdraw"
              variant="danger"
            >
              신청 철회
            </Button>
          }
        />
      );
    }
    if (!isOpen) {
      return (
        <Button disabled variant="secondary">
          모집 마감
        </Button>
      );
    }
    if (isLeader) {
      return (
        <Button disabled variant="secondary">
          운영자
        </Button>
      );
    }
    if (isApprovedMember) {
      return (
        <Button disabled variant="secondary">
          참여 완료!
        </Button>
      );
    }
    if (hasExistingRegistration) {
      return (
        <Button disabled variant="secondary">
          신청 완료
        </Button>
      );
    }
    if (submitted) {
      return (
        <Button disabled variant="secondary">
          신청 완료
        </Button>
      );
    }
    if (!isAuthenticated) {
      return (
        <Button
          className="group-apply-button group-apply-button--join"
          data-ph-capture-attribute-action="registration_start"
          onClick={() => auth.login?.()}
          variant="primary"
        >
          자리하기
        </Button>
      );
    }
    return (
      <Button
        className="group-apply-button group-apply-button--join"
        data-ph-capture-attribute-action="registration_start"
        onClick={openApplication}
        variant="primary"
      >
        자리하기
      </Button>
    );
  }

  if (!recruitment) {
    return (
      <section className={className}>
        <div className="group-recruitment-info">
          <RecruitmentHero empty compact={compact} />
        </div>
        {createRecruitmentHref ? (
          <div className="group-recruitment-empty group-recruitment-action">
            <Link
              className="group-recruitment-empty__action ui-button ui-button--primary ui-button--md"
              data-ph-capture-attribute-action="recruitment_start"
              to={createRecruitmentHref}
            >
              새 모집 만들기
            </Link>
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <section className={className}>
      <div
        aria-label="모집 상세 정보"
        className="group-recruitment-info"
        role="region"
      >
        <RecruitmentHero compact={compact} closed={!isOpen} />
        <dl className="group-recruitment-meta">
          <div>
            <dt>모집일정</dt>
            <dd className="group-recruitment-schedule">
              <strong className="group-recruitment-countdown">
                {recruitmentCountdownLabel(recruitment.startsAt, recruitment.endsAt)}
              </strong>
              <details className="group-recruitment-details">
                <summary data-ph-capture-attribute-action="recruitment_period_open">일정 자세히</summary>
                <span className="group-recruitment-period">
                  <span>
                    <span className="group-recruitment-period__label">시작</span>
                    <strong>{formatCompactLocalDateTime(recruitment.startsAt)}</strong>
                  </span>
                  <span>
                    <span className="group-recruitment-period__label">마감</span>
                    <strong>{formatCompactLocalDateTime(recruitment.endsAt)}</strong>
                  </span>
                </span>
              </details>
            </dd>
          </div>
          <div>
            <dt>참여 방식</dt>
            <dd>{recruitment.joinMethod === "AUTO" ? "선착순" : "승인제"}</dd>
          </div>
          <div>
            <dt>모집 인원</dt>
            <dd>
              승인 {recruitment.approvedCount}명 / 정원 {recruitment.capacity}명
            </dd>
          </div>
        </dl>
        <div
          aria-label={`승인 ${recruitment.approvedCount}명, 정원 ${recruitment.capacity}명`}
          aria-valuemax={recruitment.capacity}
          aria-valuemin="0"
          aria-valuenow={Math.min(recruitment.approvedCount, recruitment.capacity)}
          className="group-recruitment-progress"
          role="progressbar"
        >
          <span
            style={{
              "--progress-width": `${Math.min(
                100,
                (recruitment.approvedCount / recruitment.capacity) * 100
              )}%`
            }}
          />
        </div>
      </div>
      <div className="group-recruitment-action">{applicationAction()}</div>
      <Modal
        closeAction="registration_form_dismiss"
        description="운영자에게 전달할 신청 메시지를 작성해 주세요."
        onClose={() => {
          if (!registration.isPending) setApplicationOpen(false);
        }}
        open={applicationOpen}
        title="신청"
      >
        <ApplicationForm
          onSuccess={() => {
            setApplicationOpen(false);
            setSubmitted(true);
          }}
          registration={registration}
        />
      </Modal>
    </section>
  );
}

function RecruitmentHero({ empty = false, compact = false, closed = false }) {
  if (compact) return <div className="group-recruitment-compact-heading">
    <h2>모집 정보</h2>
    <StatusBadge tone={empty || closed ? "neutral" : "brand"}>{empty ? "모집 준비 중" : closed ? "모집 마감" : "모집 중"}</StatusBadge>
  </div>;

  const illustration = empty ? recruitmentEmptyIllustration : recruitmentOpenIllustration;
  const title = empty ? "자리없음" : "자리하나?";

  return (
    <div
      className={`group-recruitment-hero group-recruitment-hero--${empty ? "empty" : "open"}`}
    >
      <h2 className="group-recruitment-hero__heading">{title}</h2>
      <img
        alt=""
        aria-hidden="true"
        className="group-recruitment-hero__image"
        decoding="async"
        height={720}
        src={illustration}
        width={720}
      />
    </div>
  );
}

function ApplicationForm({ onSuccess, registration }) {
  const messageReference = useRef(null);
  const [messageLength, setMessageLength] = useState(0);

  async function submit(event) {
    event.preventDefault();
    const message = messageReference.current?.value ?? "";
    await registration.mutateAsync({ message: message.trim() || null });
    onSuccess();
  }

  return (
    <form
      className="group-application-form"
      data-ph-capture-attribute-action="registration_form"
      onSubmit={submit}
    >
      <Textarea
        defaultValue=""
        description={`${messageLength}/1000자 · 운영자에게 전하고 싶은 내용을 적어주세요.`}
        label="신청 메시지"
        maxLength={1000}
        onInput={(event) => setMessageLength(event.currentTarget.value.length)}
        ref={messageReference}
        rows={7}
      />
      {registration.error ? (
        <p className="application-error" role="alert">
          {registration.error.code
            ? toUserMessage(registration.error.code)
            : "신청을 보내지 못했어요. 다시 시도해주세요."}
        </p>
      ) : null}
      <Button
        data-ph-capture-attribute-action="registration_submit"
        pending={registration.isPending}
        type="submit"
        variant="primary"
      >
        신청하기
      </Button>
    </form>
  );
}

function LeaderSummary({ leader, variant }) {
  if (!leader) return null;
  const isHero = variant === "hero";

  return (
    <div className={`group-leader group-leader--${variant}`}>
      {isHero ? null : <span className="group-leader__label">운영자</span>}
      <div className="group-leader__identity">
        <Avatar
          alt={`${leader.crewName} 프로필`}
          fallback={leader.crewName.slice(0, 1)}
          size={isHero ? "sm" : "md"}
          src={leader.avatarUrl}
        />
        <div>
          {isHero ? (
            <span className="group-leader__byline">
              운영자 <span aria-hidden="true">·</span> {memberMetaLabel(leader)}
            </span>
          ) : null}
          <strong>{leader.crewName}</strong>
          {isHero ? null : <span>{memberMetaLabel(leader)}</span>}
        </div>
      </div>
    </div>
  );
}

function MemberList({ items, query, canInvite, onInvite }) {
  const [expanded, setExpanded] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const gridReference = useRef(null);

  useEffect(() => {
    const grid = gridReference.current;
    if (!grid) return undefined;

    const measureRows = () => {
      const rows = new Set(
        [...grid.querySelectorAll("[data-member-card]")].map((card) => card.offsetTop)
      );
      setRowCount(rows.size);
    };
    const frame = requestAnimationFrame(measureRows);
    const observer = new ResizeObserver(measureRows);
    observer.observe(grid);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [items.length]);

  if (query.isLoading) return <Skeleton className="group-list-skeleton" />;
  if (query.isError) return <ErrorState title="참여자를 불러오지 못했어요" />;
  if (items.length === 0) return <EmptyState title="아직 함께하는 참여자가 없어요" />;

  const cohorts = cohortItems(items);
  const canToggle = rowCount > 3 || query.hasNextPage || expanded;

  async function toggleMembers() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    let nextPage = query.hasNextPage;
    while (nextPage) {
      const result = await query.fetchNextPage();
      nextPage = result.hasNextPage;
    }
    setExpanded(true);
  }

  return (
    <div className="group-members-overview">
      <section aria-labelledby="group-members-title" className="group-members-list-panel">
        <div className="group-members-list-panel__heading">
          <h2 id="group-members-title">참여자</h2>
          {canInvite ? <Button className="invitation-member-trigger" data-ph-capture-attribute-action="invitation_create" onClick={onInvite} size="sm" variant="secondary"><Plus size={14} aria-hidden="true" /> 초대</Button> : null}
        </div>
        <ul
          className={`group-member-grid${!expanded && rowCount > 3 ? " is-collapsed" : ""}`}
          ref={gridReference}
        >
          {items.map((member) => (
            <li data-member-card key={member.memberId}>
              <Avatar
                alt={`${member.crewName} 프로필`}
                className="group-member-avatar"
                fallback={member.crewName.slice(0, 1)}
                size="md"
                src={member.avatarUrl}
              />
              <div className="group-member-card__copy">
                <div className="group-member-card__name-row">
                  <strong>{member.crewName}</strong>
                </div>
                <div className="group-member-card__meta">
                  <span>{nonCrewMemberTypeLabel(member.memberType) ?? generationLabel(member.generation)}</span>
                  {member.role === "LEADER" ? (
                    <span className="group-member-card__role">운영자</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {canToggle ? (
          <Button pending={query.isFetchingNextPage} onClick={toggleMembers}>
            {expanded ? "접기" : "더보기"}
          </Button>
        ) : null}
      </section>
      <CohortDonut cohorts={cohorts} total={items.length} />
    </div>
  );
}

function generationLabel(generation) {
  return Number.isInteger(generation) && generation > 0 ? `${generation}기` : "기수 미정";
}

function cohortItems(members) {
  const counts = new Map();
  for (const member of members) {
    const key = memberCohortKey(member);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => compareMemberCohortKeys(left, right))
    .map(([generation, count], index) => ({
      count,
      generation,
      label: memberCohortLabel(generation),
      tone: (index % 5) + 1
    }));
}

function CohortDonut({ cohorts, total }) {
  const [hoveredCohort, setHoveredCohort] = useState(null);
  const [selectedCohort, setSelectedCohort] = useState(null);
  const activeCohort = selectedCohort ?? hoveredCohort;
  const circumference = 2 * Math.PI * 42;
  const chartSegments = cohorts.reduce(
    ({ segments, offset }, cohort) => {
      const length = (cohort.count / total) * circumference;
      return {
        offset: offset + length,
        segments: [...segments, { cohort, length, offset }]
      };
    },
    { offset: 0, segments: [] }
  ).segments;

  function toggleCohort(cohort) {
    setSelectedCohort((current) => (current?.generation === cohort.generation ? null : cohort));
  }

  return (
    <section aria-labelledby="group-cohort-title" className="group-cohort-panel">
      <div className="group-cohort-panel__heading">
        <h3 id="group-cohort-title">기수 구성</h3>
        <span>총 {total}명</span>
      </div>
      <div className="group-cohort-panel__chart-wrap">
        <div
          aria-label={`기수 구성 총 ${total}명`}
          className="group-cohort-panel__donut"
          role="group"
        >
          <svg className="group-cohort-panel__svg" viewBox="0 0 120 120">
            <circle
              aria-hidden="true"
              className="group-cohort-panel__donut-track"
              cx="60"
              cy="60"
              r="42"
            />
            {chartSegments.map(({ cohort, length, offset }) => (
              <circle
                aria-label={`${cohort.label} · ${cohort.count}명`}
                className={`group-cohort-panel__segment${
                  activeCohort?.generation === cohort.generation ? " is-active" : ""
                }`}
                cx="60"
                cy="60"
                key={cohort.generation}
                onFocus={() => setHoveredCohort(cohort)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleCohort(cohort);
                  }
                }}
                onMouseEnter={() => setHoveredCohort(cohort)}
                onMouseLeave={() => setHoveredCohort(null)}
                onPointerDown={() => toggleCohort(cohort)}
                onBlur={() => setHoveredCohort(null)}
                r="42"
                role="button"
                tabIndex="0"
                style={{
                  "--cohort-color": `var(--color-cohort-${cohort.tone})`,
                  strokeDasharray: `${length} ${circumference - length}`,
                  strokeDashoffset: -offset
                }}
              />
            ))}
          </svg>
          <div className="group-cohort-panel__donut-label">
            <strong>{total}명</strong>
            <span>전체 참여자</span>
          </div>
          {activeCohort ? (
            <div className="group-cohort-panel__tooltip" role="status">
              {activeCohort.label} · {activeCohort.count}명
            </div>
          ) : null}
        </div>
        <ul className="group-cohort-panel__legend">
          {cohorts.map((cohort) => (
            <li key={cohort.generation}>
              <i aria-hidden="true" className={`is-tone-${cohort.tone}`} />
              <span>{cohort.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MemberTab({ groupId, leader, canInvite, onInvite }) {
  const query = useInfiniteGroupMembers(groupId);
  const members = flattenPages(query.data, (member) => member.groupMemberId);
  const items = leader
    ? [{ ...leader, role: "LEADER" }, ...members.filter((member) => member.memberId !== leader.memberId)]
    : members;
  return <MemberList items={items} query={query} canInvite={canInvite} onInvite={onInvite} />;
}
