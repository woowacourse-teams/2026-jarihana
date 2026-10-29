import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Hand,
  Laptop,
  Link2,
  MapPin,
  MessageCircle,
  Search,
  Smile,
  UserPlus,
  Users,
  UsersRound,
  X
} from "lucide-react";

import { Avatar, GroupImage, StatusBadge } from "../../shared/ui";
import { DiscoveryGroupCard } from "../groups/home/DiscoveryGroupCard";
import "../groups/home/discovery.css";
import "../groups/groupCalendar.css";
import "../chat/chat.css";
import "../proposals/proposals.css";
import { ProposalCategoryIcon } from "../proposals/ProposalCategoryIcon";
import recruitmentImage from "../../shared/assets/illustrations/group-recruitment-open.webp";
import studyImage from "../../shared/assets/landing/default-group-study.webp";
import { LandingActivityScene } from "./LandingActivityScene";
import "./landing-product-scene.css";
import "./landing-guide-motion.css";

const studyGroup = {
  id: "landing-study-example",
  type: "STUDY",
  name: "함께 배우는 토요일",
  introduction: "같은 목표, 서로 다른 생각.",
  recruiting: true,
  location: "강남역 스터디룸",
  recurringSchedule: { daysOfWeek: ["SATURDAY"], startTime: "14:00:00", endTime: "16:00:00" },
  activeRecruitment: { capacity: 6, approvedCount: 5 }
};

const bookGroup = {
  id: "landing-book-example",
  type: "CLUB",
  name: "책으로 만나는 사이",
  introduction: "좋아하는 문장을 나눠요.",
  location: "성수 북카페",
  recurringSchedule: { daysOfWeek: ["SATURDAY"], startTime: "16:00:00", endTime: "18:00:00" }
};

function CardSurface({ children, className }) {
  return <div className={className}>{children}</div>;
}

function MotionSwap({ before, after, delay, className = "" }) {
  return (
    <span className={`lpm-swap ${className}`} style={{ "--motion-delay": delay }}>
      <span className="lpm-before">{before}</span>
      <span className="lpm-after">{after}</span>
    </span>
  );
}

function SceneHeading({ eyebrow, children, trailing }) {
  return (
    <div className="lps-heading lps-enter">
      <div>
        {eyebrow ? <span className="lps-eyebrow">{eyebrow}</span> : null}
        <strong className="lps-title">{children}</strong>
      </div>
      {trailing}
    </div>
  );
}

function GroupIdentity() {
  return (
    <div className="lps-group-identity">
      <img alt="" src={studyImage} width="56" height="56" />
      <div>
        <span className="lps-eyebrow">스터디</span>
        <strong>{studyGroup.name}</strong>
      </div>
    </div>
  );
}

function BrowseScene() {
  return (
    <div className="groups-discovery-section lps-browse">
      <SceneHeading>자리 둘러보기</SceneHeading>
      <div className="lps-discovery-tools lps-enter">
        <div className="groups-discovery-search__control">
          <span className="lpm-type" style={{ "--motion-delay": "0.65s" }}>함께</span>
          <Search size={20} />
        </div>
        <div className="groups-discovery-filter">
          <div className="groups-discovery-filter__field"><span>모임 유형</span><div className="groups-discovery-filter__select"><span className="lps-filter-value">전체</span></div></div>
          <div className="groups-discovery-filter__field"><span>모임 상태</span><div className="groups-discovery-filter__select"><span className="lps-filter-value">활동 중</span></div></div>
          <div className="groups-discovery-filter__field"><span>모집 상태</span><div className="groups-discovery-filter__select"><MotionSwap className="lps-filter-value" before="전체" after="모집 중" delay="1.8s" /></div></div>
        </div>
      </div>
      <div className="lps-discovery-cards">
        <div className="lpm-arrive lpm-card-focus" style={{ "--motion-delay": "2.4s" }}>
          <DiscoveryGroupCard as={CardSurface} group={studyGroup} recruiting />
        </div>
        <div className="lpm-arrive" style={{ "--motion-delay": "2.6s" }}>
          <DiscoveryGroupCard as={CardSurface} group={{ ...bookGroup, name: "함께 읽는 토요일", activeRecruitment: { capacity: 8, approvedCount: 5 } }} recruiting />
        </div>
      </div>
    </div>
  );
}

function DetailScene() {
  return (
    <>
      <div className="lps-detail-hero lps-enter">
        <img alt="" src={studyImage} className="lps-detail-hero__image" />
        <span className="lps-eyebrow">스터디</span>
        <strong className="lps-title">{studyGroup.name}</strong>
        <p>{studyGroup.introduction}</p>
        <strong>모임 정보</strong>
        <div className="lps-detail-info">
          <span><CalendarDays size={16} /> 매주 토 · 14:00–16:00</span>
          <span><MapPin size={16} /> 강남역 스터디룸</span>
          <span><UsersRound size={16} /> 참여 5명</span>
        </div>
      </div>
      <div className="lps-tabs"><span className="lps-selected">소개</span><span>캘린더</span><span>활동 기록</span><span>참여자</span></div>
      <div className="lps-recruitment lpm-emphasis" style={{ "--motion-delay": "0.8s" }}>
        <img alt="" src={recruitmentImage} className="lps-recruitment-image" />
        <dl><div><dt>참여 방식</dt><dd>승인제</dd></div><div><dt>모집 인원</dt><dd>승인 5명 / 정원 6명</dd></div></dl>
        <div className="lps-seat-meter"><span /></div>
        <MotionSwap className="lps-action" delay="4.3s" before="신청하기" after="신청 완료" />
      </div>
      <div className="lps-application-overlay">
        <div className="lps-application lps-panel">
          <SceneHeading trailing={<X size={20} />}>신청</SceneHeading>
          <p className="lps-body">운영자에게 전달할 신청 메시지를 작성해 주세요.</p>
          <span className="lps-label">신청 메시지</span>
          <p className="lps-application-message"><span className="lpm-type" style={{ "--motion-delay": "2s", "--type-duration": "1.4s" }}>혼자 공부하던 내용을 함께 나누고 싶어요.</span></p>
          <span className="lps-account-meta">운영자에게 전하고 싶은 내용을 적어주세요.</span>
          <span className="lps-action lpm-submit" style={{ "--motion-delay": "4.3s" }}>신청하기</span>
        </div>
      </div>
    </>
  );
}

function ContinueScene() {
  return (
    <>
      <SceneHeading>마이페이지</SceneHeading>
      <p className="lps-account-description">가입한 모임과 신청 내역을 한곳에서 확인하세요.</p>
      <div className="lps-account-layout">
      <div className="lps-profile lps-enter">
        <span className="lps-eyebrow">나의 프로필</span>
        <Avatar fallback="하" />
        <strong>하루</strong>
        <span>부트캠프</span>
      </div>
      <div className="lps-account-panels">
      <div className="lps-dashboard-panel lps-enter">
        <strong className="lps-item-title">내 모임</strong>
        <div className="lps-count-tabs">
          <span><strong>0</strong> 같이해요</span>
          <span className="lps-selected lpm-tab-focus" style={{ "--motion-delay": "0.6s" }}><strong><MotionSwap before="0" after="1" delay="1.2s" /></strong> 동아리·스터디</span>
        </div>
        <div className="lps-account-row lpm-arrive" style={{ "--motion-delay": "1.2s" }}>
          <GroupImage alt="" group={studyGroup} width="84" height="108" />
          <div>
            <span className="lps-type-study">스터디</span>
            <strong>{studyGroup.name}</strong>
            <p>{studyGroup.introduction}</p>
            <span className="lps-account-meta"><UsersRound size={15} /> 6명</span>
          </div>
        </div>
      </div>
      <div className="lps-dashboard-panel lps-enter">
        <strong className="lps-item-title">내 신청</strong>
        <div className="lps-count-tabs">
          <span className="lps-selected lpm-tab-focus" style={{ "--motion-delay": "2.8s" }}><strong><MotionSwap before="0" after="1" delay="3.4s" /></strong> 검토 중</span>
          <span><strong>0</strong> 미승인</span>
        </div>
        <div className="lps-account-row lpm-arrive" style={{ "--motion-delay": "3.4s" }}>
          <GroupImage alt="" group={bookGroup} width="84" height="108" />
          <div>
            <StatusBadge tone="warning">검토 중</StatusBadge>
            <strong>{bookGroup.name}</strong>
            <p>좋아하는 책 이야기를 나누고 싶어요.</p>
            <span className="lps-account-meta"><CalendarDays size={15} /> 2026. 10. 10. 신청</span>
          </div>
        </div>
      </div>
      </div>
      </div>
    </>
  );
}

// 응답 5명 기준의 모인 조건이다. 실제 상세 화면처럼 가장 많이 고른 선택지를 칩에 보여 준다.
const gatheredChips = [
  { icon: Clock, label: "주말 오후", count: 5, delay: "3.1s" },
  { icon: Laptop, label: "오프라인", count: 4, delay: "3.3s" },
  { icon: Smile, label: "초보 환영", count: 4, delay: "3.5s" }
];

const timeSlotRows = [
  { label: "주말 오후", count: 5 },
  { label: "평일 저녁", count: 2 },
  { label: "주말 오전", count: 1 }
];

function ProposalPill({ count, on = false }) {
  return (
    <span className={on ? "proposal-pill proposal-pill--on" : "proposal-pill"}>
      <Hand size={16} />
      함께하고 싶어요
      <b>{count}</b>
    </span>
  );
}

function ProposalScene() {
  return (
    <>
      <SceneHeading eyebrow="작은 생각이 모임이 되는 곳">자유게시판</SceneHeading>
      <div className="proposal-card__body lpm-arrive" style={{ "--motion-delay": "0.3s" }}>
        <p className="proposal-card__meta">
          <span className="proposal-badge proposal-badge--study">
            <ProposalCategoryIcon code="STUDY" size={13} />
            스터디
          </span>
          <span className="proposal-card__author">하루</span>
          <span>모임 제안</span>
        </p>
        <strong className="proposal-card__title">주말에 같이 공부할 사람 있나요?</strong>
        <p className="proposal-card__summary">각자 공부한 내용을 짧게 나누고, 막히는 부분은 같이 풀어 봐요.</p>
        <div className="proposal-card__foot">
          <MotionSwap
            className="lps-proposal-pill"
            delay="1.9s"
            before={<ProposalPill count={4} />}
            after={<ProposalPill count={5} on />}
          />
          <span className="proposal-card__stat"><MessageCircle size={15} /> 코멘트 2</span>
          <span className="proposal-card__time">1시간 전</span>
        </div>
      </div>
      <div className="proposal-gathered lpm-arrive" style={{ "--motion-delay": "2.7s" }}>
        <span className="proposal-eyebrow">모인 조건</span>
        <strong className="proposal-section-title">지금 가장 잘 맞는 모습</strong>
        <p className="proposal-gathered__desc">응답 5명 기준이에요.</p>
        <div className="proposal-summary">
          {gatheredChips.map(({ icon: Icon, label, count, delay }) => (
            <span className="proposal-summary-chip__button lpm-arrive" key={label} style={{ "--motion-delay": delay }}>
              <Icon size={15} />
              <span className="proposal-summary-chip__value">{label}</span>
              <b className="proposal-summary-chip__count">{count}명</b>
              <ChevronDown className="proposal-summary-chip__chevron" size={15} />
            </span>
          ))}
        </div>
        <div className="proposal-summary-chip__panel lps-proposal-rows lpm-arrive" style={{ "--motion-delay": "4s" }}>
          <span className="proposal-summary-chip__title">가능한 시간</span>
          <ul className="proposal-summary-chip__list">
            {timeSlotRows.map((row, index) => (
              <li
                className={index === 0 ? "proposal-bar-row proposal-bar-row--lead" : "proposal-bar-row"}
                key={row.label}
                style={{ "--motion-delay": `${4.4 + index * 0.15}s` }}
              >
                <span className="proposal-bar-row__label">{row.label}</span>
                <span className="proposal-bar-row__track">
                  <i style={{ inlineSize: `${(row.count / 5) * 100}%` }} />
                </span>
                <span className="proposal-bar-row__count">{row.count}명</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

// 채팅 예시: 안 읽은 메시지 2개가 있는 대화방을 열어 읽고, 바로 답장한다.
const chatRooms = [
  {
    group: studyGroup,
    type: "study",
    typeLabel: "스터디",
    members: 6,
    time: "13:12",
    preview: "저 조금 늦어요. 먼저 시작해 주세요!",
    unread: 2
  },
  {
    group: bookGroup,
    type: "club",
    typeLabel: "동아리",
    members: 8,
    time: "어제",
    preview: "다음 책은 투표로 정해요."
  }
];

const chatMessages = [
  { id: "moa", author: "모아", text: "오늘 2시 강남역 스터디룸 맞죠?", time: "13:05", delay: "2.2s" },
  { id: "bada", author: "바다", text: "저 조금 늦어요. 먼저 시작해 주세요!", time: "13:12", delay: "2.5s" }
];

const myReply = "3번 방이에요. 천천히 오세요!";

function ChatRoomRow({ room, active = false }) {
  return (
    <li>
      <div
        className={`chat-room-row chat-room-row--${room.type}${active ? " lpm-emphasis" : ""}`}
        style={active ? { "--motion-delay": "1.2s" } : undefined}
      >
        <span className="chat-room-row__cover">
          <GroupImage alt="" group={room.group} height="64" width="64" />
        </span>
        <div className="chat-room-row__body">
          <div className="chat-room-row__title">
            <strong>{room.group.name}</strong>
            <time>{room.time}</time>
          </div>
          <div className="chat-room-row__preview">
            <p>{room.preview}</p>
            {room.unread ? (
              <MotionSwap
                after={null}
                before={<span className="chat-unread">{room.unread}</span>}
                className="lps-chat-unread"
                delay="1.6s"
              />
            ) : null}
          </div>
          <span className="chat-room-row__meta">
            <span className="chat-room-type">{room.typeLabel}</span>
            <span>참여자 {room.members}명</span>
          </span>
        </div>
      </div>
    </li>
  );
}

function ChatScene() {
  return (
    <>
      <div className="lps-chat-list lpm-arrive" style={{ "--motion-delay": "0.3s" }}>
        <div className="lps-chat-list__heading">
          <strong className="lps-title">채팅</strong>
          <span>내 모임 {chatRooms.length}</span>
        </div>
        <ul className="chat-room-list">
          {chatRooms.map((room, index) => (
            <ChatRoomRow active={index === 0} key={room.group.id} room={room} />
          ))}
        </ul>
      </div>
      <div className="lps-chat-room lpm-arrive" style={{ "--motion-delay": "1.8s" }}>
        <div className="chat-conversation__header">
          <div className="chat-conversation__identity">
            <strong className="lps-chat-room__title">{studyGroup.name}</strong>
            <span><Users size={12} /> 참여자 6명</span>
          </div>
        </div>
        <div className="chat-thread lps-chat-thread">
          <div className="chat-date"><span>10월 24일 토요일</span></div>
          {chatMessages.map((message) => (
            <div className="chat-message lpm-arrive" key={message.id} style={{ "--motion-delay": message.delay }}>
              <div className="chat-message__avatar">
                <Avatar fallback={message.author.slice(0, 1)} size="sm" />
              </div>
              <div className="chat-message__content">
                <span className="chat-message__author">{message.author}</span>
                <div className="chat-message__line">
                  <p className="chat-message__bubble">{message.text}</p>
                  <time>{message.time}</time>
                </div>
              </div>
            </div>
          ))}
          <div className="chat-message chat-message--mine lpm-arrive" style={{ "--motion-delay": "4.7s" }}>
            <div className="chat-message__content">
              <div className="chat-message__line">
                <p className="chat-message__bubble">{myReply}</p>
                <time>13:14</time>
              </div>
            </div>
          </div>
        </div>
        <div className="chat-composer lps-chat-composer">
          <div className="chat-composer__field">
            <span className="lps-chat-input">
              <MotionSwap
                after={<span className="lps-chat-placeholder">모임에 이야기를 건네보세요</span>}
                before={<span className="lpm-type" style={{ "--motion-delay": "3.1s", "--type-duration": "1.3s" }}>{myReply}</span>}
                delay="4.7s"
              />
            </span>
            <span className="ui-button ui-button--primary ui-button--md chat-send lpm-submit" style={{ "--motion-delay": "4.7s" }}>
              전송
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// 캘린더 예시: 2026년 10월(1일이 목요일)을 실제 휴대폰 화면처럼 점으로 보여 주고, 22일에서 24일로 날짜를 옮긴다.
const CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const calendarDays = [
  ...[27, 28, 29, 30].map((day) => ({ day, outside: true })),
  ...Array.from({ length: 31 }, (_, index) => ({ day: index + 1, outside: false }))
];

function calendarDots(day, outside) {
  if (outside) return [];
  const dots = [];
  if ((day - 3) % 7 === 0) dots.push("recurring");
  if (day === 22) dots.push("group_event");
  return dots;
}

function CalendarEvent({ kind, time, title }) {
  return (
    <span className={`group-calendar__event group-calendar__event--${kind}`}>
      <span className="group-calendar__event-copy">
        <span className="group-calendar__event-time">{time}</span>
        <span className="group-calendar__event-title">{title}</span>
      </span>
    </span>
  );
}

function CalendarAgenda({ label, children }) {
  return (
    <span className="lps-calendar-agenda">
      <span className="group-calendar__agenda-heading">
        <strong>{label}</strong>
        <span>일정 1개</span>
      </span>
      {children}
    </span>
  );
}

function CalendarScene() {
  return (
    <div className="group-calendar lpm-arrive" style={{ "--motion-delay": "0.3s" }}>
      <div className="group-calendar__toolbar">
        <div className="group-calendar__navigation">
          <strong className="lps-calendar-month">2026년 10월</strong>
          <span className="group-calendar__today-button lps-calendar-chip">오늘</span>
        </div>
      </div>
      <div className="group-calendar__legend">
        <span><i className="group-calendar__swatch group-calendar__swatch--recurring" /> 정기 모임</span>
        <span><i className="group-calendar__swatch group-calendar__swatch--group-event" /> 개별 일정</span>
        <span><i className="group-calendar__swatch group-calendar__swatch--session" /> 같이해요</span>
      </div>
      <div className="group-calendar__grid">
        <div className="group-calendar__weekdays">
          {CALENDAR_WEEKDAYS.map((label) => <span key={label}>{label}</span>)}
        </div>
        <div className="group-calendar__days">
          {calendarDays.map(({ day, outside }, index) => {
            const dots = calendarDots(day, outside);
            const pick = day === 22 && !outside ? " lps-calendar-day--from" : day === 24 && !outside ? " lps-calendar-day--to" : "";
            return (
              <div className={`group-calendar__day${outside ? " is-outside" : ""}${pick}`} key={`${outside ? "prev" : "oct"}-${day}`}>
                <span className={`group-calendar__date${day === 22 && !outside ? " is-today" : ""}`}>
                  <span className="group-calendar__date-number">{day}</span>
                </span>
                {dots.length ? (
                  <span
                    className="group-calendar__dots lpm-arrive"
                    style={{ "--motion-delay": `${0.8 + Math.floor(index / 7) * 0.15}s` }}
                  >
                    {dots.map((kind) => <i className={`group-calendar__dot group-calendar__dot--${kind}`} key={kind} />)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="group-calendar__agenda">
        <MotionSwap
          after={(
            <CalendarAgenda label="10월 24일 토요일">
              <CalendarEvent kind="recurring" time="14:00-16:00" title={studyGroup.name} />
            </CalendarAgenda>
          )}
          before={(
            <CalendarAgenda label="10월 22일 목요일">
              <CalendarEvent kind="group_event" time="20:00" title="온라인 중간 점검" />
            </CalendarAgenda>
          )}
          className="lps-calendar-swap"
          delay="2.8s"
        />
        <p className="group-calendar__privacy-note">장소와 설명은 모임원에게만 보여요.</p>
      </div>
    </div>
  );
}

function Applicant({ name, typeLabel, approved, children }) {
  return (
    <div className="lps-applicant lps-enter">
      <div className="lps-person">
        <Avatar fallback={name.slice(0, 1)} />
        <div>
        {approved ? <StatusBadge tone="brand">승인</StatusBadge> : (
          <MotionSwap delay="3.8s"
            before={<StatusBadge tone="warning">대기</StatusBadge>}
            after={<StatusBadge tone="brand">승인</StatusBadge>} />
        )}
          <strong>{name}</strong>
          <span>{typeLabel} / 신청 2026. 10. 10.</span>
        </div>
      </div>
      <p className="lps-body">{children}</p>
      {approved ? (
        <span className="lps-approved">
          <Check size={17} />
          처리 2026. 10. 10.
        </span>
      ) : (
        <MotionSwap className="lpm-decision" delay="3.8s"
          before={<span className="lps-decisions"><span className="lps-selected lpm-approve">승인</span><span>미승인</span></span>}
          after={<span className="lps-approved">처리 2026. 10. 10.</span>} />
      )}
    </div>
  );
}

function ManageScene() {
  return (
    <>
      <SceneHeading>{studyGroup.name}</SceneHeading>
      <div className="lps-tabs lps-manage-tabs">
        <span>모임 수정</span><span>모집 관리</span><span>모집 이력</span><span className="lps-selected">신청 관리</span><span>참여자 관리</span>
      </div>
      <div className="lps-manage-layout">
      <div>
      <div className="lps-manage-toolbar"><strong>신청자 목록</strong><span>전체 <ChevronDown size={14} /></span></div>
      <Applicant typeLabel="부트캠프" name="하루">혼자 공부하던 내용을 함께 나누고 싶어요.</Applicant>
      <Applicant typeLabel="현직자" name="모아" approved>
        매주 작은 목표를 정하고 꾸준히 공부하고 싶어요.
      </Applicant>
      </div>
      <div className="lps-manage-summary lps-enter">
        <div><strong>모집 상태</strong><StatusBadge tone="brand">모집 중</StatusBadge></div>
        <strong>승인 <MotionSwap before="5" after="6" delay="3.8s" /> / 정원 6명</strong>
        <span>승인제</span>
      </div>
      </div>
    </>
  );
}

function InviteScene() {
  return (
    <>
      <div className="lps-invite-context"><GroupIdentity /><MotionSwap className="lps-share-button" delay="5.6s" before={<><Link2 size={16} />초대 링크 복사</>} after={<><Check size={16} />링크를 복사했어요</>} /></div>
      <div className="lps-panel lps-invite-panel lps-enter">
        <SceneHeading trailing={<X size={24} />}>멤버 초대</SceneHeading>
        <div className="lps-tabs">
          <span className="lps-selected">회원 초대</span>
          <span>보낸 초대</span>
        </div>
        <div className="lps-invite-search"><div className="lps-search">
          <span className="lpm-type" style={{ "--motion-delay": "0.6s", "--type-duration": "0.5s" }}>하루</span>
        </div><span className="lps-search-submit"><Search size={18} />검색</span></div>
        <MotionSwap delay="4.2s" after={null} before={<span className="lps-selection lpm-arrive" style={{ "--motion-delay": "2.6s" }}>
          <span>
            선택한 회원 <strong>1명</strong>
          </span>
          <span className="lps-member-chip">
            하루 <X size={14} />
          </span>
        </span>} />
        <div className="lps-candidate lpm-arrive" style={{ "--motion-delay": "1.6s" }}>
          <MotionSwap delay="4.2s"
            before={<span className="lps-checkbox lpm-check" style={{ "--motion-delay": "2.4s" }}><Check size={16} /></span>}
            after={<span className="lps-checkbox lps-checkbox--empty" />} />
          <div>
            <strong>하루</strong>
            <span>부트캠프</span>
          </div>
        </div>
        <span className="lps-invite-summary lpm-arrive" style={{ "--motion-delay": "4.2s" }}>1명에게 초대를 보냈어요.</span>
        <div className="lps-dialog-actions"><span>닫기</span><MotionSwap className="lps-action lpm-submit" delay="4.2s"
          before={<><UserPlus size={17} />선택한 <MotionSwap before="0" after="1" delay="2.4s" />명 초대하기</>}
          after={<><UserPlus size={17} />선택한 0명 초대하기</>} /></div>
      </div>
    </>
  );
}

const scenes = {
  browse: BrowseScene,
  detail: DetailScene,
  continue: ContinueScene,
  proposal: ProposalScene,
  manage: ManageScene,
  invite: InviteScene,
  chat: ChatScene,
  calendar: CalendarScene,
  activity: LandingActivityScene
};

export function LandingProductScene({ screen }) {
  const Scene = scenes[screen];
  if (!Scene) return null;
  return (
    <div aria-hidden="true" className={`landing-product-scene landing-product-scene--${screen}`}>
      <Scene />
    </div>
  );
}
