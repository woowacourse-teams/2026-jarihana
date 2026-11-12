import { useId, useState } from "react";
import { ChevronLeft, ChevronRight, Image, Megaphone } from "lucide-react";

import { useAnnouncementDetail } from "../../features/announcement/hooks.js";
import { Button, IconButton, Modal } from "../../shared/ui/index.js";
import { formatCompactLocalDateTime } from "./pageUtils.js";
import "./announcements.css";
import "./clubhouse-content-dialog.css";

function ContentState({ status, onRetry, kind, retryAction }) {
  if (status === "loading") return <p role="status">{kind} 불러오는 중…</p>;
  if (status === "denied") return <p role="alert">로그인과 모임 참여 상태를 확인한 뒤 다시 열어 주세요.</p>;
  return (
    <div>
      <p role="alert">{kind}을 불러오지 못했어요.</p>
      <Button variant="secondary" data-ph-capture-attribute-action={retryAction} onClick={() => void onRetry()}>
        다시 시도
      </Button>
    </div>
  );
}

function ActivityRecords({ groupId, recordId, exhibit, onOpen, onRetry, onDisplayRecord }) {
  const photos = exhibit.records.filter((record) => record.photo);
  const [selected, setSelected] = useState(recordId);
  const [failedPhoto, setFailedPhoto] = useState(null);
  const index = selected == null ? 0 : photos.findIndex((record) => String(record.id) === String(selected));
  const record = exhibit.status === "ready" ? photos[index] : null;
  const date = record?.activityDate || record?.createdAt;

  return (
    <section className="clubhouse-content-dialog__activity" aria-label="활동 기록" data-ph-private>
      {exhibit.status !== "ready" ? (
        <ContentState status={exhibit.status} onRetry={onRetry} kind="활동 기록" retryAction="group_activity_retry" />
      ) : record ? (
        <>
          {failedPhoto === record.photo ? (
            <p className="clubhouse-content-dialog__photo-fallback">사진을 불러오지 못했어요.</p>
          ) : <img key={record.photo} src={record.photo} alt={record.title} onError={() => setFailedPhoto(record.photo)} />}
          <h3>{record.title}</h3>
          <p className="clubhouse-content-dialog__meta">
            <time dateTime={date}>{new Date(date).toLocaleDateString("ko-KR")}</time>
            {record.author?.name && <> · {record.author.name}</>}
          </p>
        </>
      ) : <p>{selected == null ? "아직 등록된 활동 사진이 없어요." : "이 활동 사진을 찾을 수 없어요. 활동 기록에서 확인해 주세요."}</p>}
      {photos.length > 1 && exhibit.status === "ready" && (
        <nav className="clubhouse-content-dialog__pagination" aria-label="활동 사진 넘기기">
          <IconButton
            label="이전 활동 사진"
            variant="secondary"
            aria-disabled={index <= 0}
            data-ph-capture-attribute-action="group_activity_photo_previous"
            onClick={() => { if (index > 0) setSelected(photos[index - 1].id); }}
          ><ChevronLeft size={20} /></IconButton>
          <span aria-live="polite">{index < 0 ? "선택한 기록" : `${index + 1} / ${photos.length}`}</span>
          <IconButton
            label="다음 활동 사진"
            variant="secondary"
            aria-disabled={index >= photos.length - 1}
            data-ph-capture-attribute-action="group_activity_photo_next"
            onClick={() => { if (index < photos.length - 1) setSelected(photos[index + 1].id); }}
          ><ChevronRight size={20} /></IconButton>
        </nav>
      )}
      <div className="clubhouse-content-dialog__actions">
        <Button
          variant="secondary"
          data-ph-capture-attribute-action={record ? "group_activity_open" : "group_activities_open"}
          onClick={() => onOpen("activities", { link: record?.link || `/groups/${groupId}?tab=activities` })}
        >{record ? "웹에서 이 기록 보기" : "웹에서 활동 목록 보기"}<ChevronRight size={16} aria-hidden="true" /></Button>
        {record && onDisplayRecord && (
          <Button variant="secondary" data-ph-capture-attribute-action="group_activity_display" onClick={() => onDisplayRecord(record)}>
            이 사진을 액자에 전시
          </Button>
        )}
      </div>
    </section>
  );
}

function AnnouncementBody({ groupId, noticeId, auth, onOpen }) {
  const detail = useAnnouncementDetail(
    groupId, String(noticeId), auth.member?.id, auth.sessionVersion,
    auth.status !== "loading" && !auth.logoutPending
  );
  if (auth.logoutPending || detail.isPending) return <p role="status">공지 본문 불러오는 중…</p>;
  if ([401, 403, 404].includes(detail.error?.status)) return <p role="alert">삭제되었거나 현재 계정으로 볼 수 없는 공지예요.</p>;
  if (detail.isError || !detail.data) return <ContentState status="error" onRetry={detail.refetch} kind="공지 본문" retryAction="group_announcement_detail_retry" />;
  const notice = detail.data;
  return (
    <>
      <p className="clubhouse-content-dialog__meta">{formatCompactLocalDateTime(notice.createdAt)}</p>
      <p className="clubhouse-content-dialog__notice-body">{notice.content}</p>
      <Button variant="secondary" data-ph-capture-attribute-action="group_announcement_web_open"
        onClick={() => onOpen("announcements", { link: `/groups/${groupId}/announcements/${noticeId}` })}>
        웹에서 이 공지 보기<ChevronRight size={16} aria-hidden="true" />
      </Button>
    </>
  );
}

function Announcements({ groupId, auth, announcements, onRetry, onOpen }) {
  const rowId = useId();
  const [selected, setSelected] = useState(null);
  return (
    <section className="clubhouse-content-dialog__announcements" aria-label="모임 공지" data-ph-private>
      {announcements.status !== "ready" ? (
        <ContentState status={announcements.status} onRetry={onRetry} kind="공지 목록" retryAction="group_announcement_list_retry" />
      ) : announcements.records.length ? (
        <ul className="group-announcement-list">
          {announcements.records.map((notice) => (
            <li key={notice.id} className="group-announcement-list__item">
              <button
                type="button"
                className="group-announcement-card"
                aria-expanded={selected === notice.id}
                aria-controls={`${rowId}-${notice.id}`}
                data-ph-capture-attribute-action="group_announcement_open"
                onClick={() => setSelected(selected === notice.id ? null : notice.id)}
              >
                <span className="group-announcement-card__title">{notice.title}</span>
                <span className="group-announcement-card__meta">{notice.scope === "MEMBERS" ? "모임원 공개" : "전체 공개"} · {notice.authorNickname}</span>
              </button>
              <div className="clubhouse-content-dialog__notice" id={`${rowId}-${notice.id}`} hidden={selected !== notice.id}>
                {selected === notice.id && <AnnouncementBody groupId={groupId} noticeId={notice.id} auth={auth} onOpen={onOpen} />}
              </div>
            </li>
          ))}
        </ul>
      ) : <p>아직 등록된 공지가 없어요.</p>}
      <div className="clubhouse-content-dialog__actions">
        <Button variant="secondary" data-ph-capture-attribute-action="group_announcement_tab_open"
          onClick={() => onOpen("announcements", { link: `/groups/${groupId}?tab=announcements` })}>
          웹에서 공지 목록 보기<ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

export function ClubhouseContentDialog({ selection, groupId, auth, exhibit, announcements, onRetry, onRetryAnnouncements, onClose, onSelect, onOpen, onDisplayRecord }) {
  const showingAnnouncements = selection?.feature === "dashboard";
  return (
    <Modal open={Boolean(selection)} title="모임 소식·추억" panelClassName="clubhouse-content-dialog"
      closeLabel="모임 소식·추억 닫기" closeAction="group_panel_close" onClose={onClose}>
      <nav className="clubhouse-content-dialog__tabs" aria-label="모임 소식·추억 메뉴">
        <Button variant={showingAnnouncements ? "primary" : "secondary"} aria-pressed={showingAnnouncements}
          data-ph-capture-attribute-action="group_dashboard_open" onClick={() => onSelect("dashboard")}>
          <Megaphone size={18} aria-hidden="true" />공지사항
        </Button>
        <Button variant={showingAnnouncements ? "secondary" : "primary"} aria-pressed={!showingAnnouncements}
          data-ph-capture-attribute-action="group_activities_open" onClick={() => onSelect("activities")}>
          <Image size={18} aria-hidden="true" />활동 기록
        </Button>
      </nav>
      {selection && (showingAnnouncements ? (
        <Announcements groupId={groupId} auth={auth} announcements={announcements} onRetry={onRetryAnnouncements} onOpen={onOpen} />
      ) : (
        <ActivityRecords key={selection.recordId || "recent"} groupId={groupId} recordId={selection.recordId} exhibit={exhibit}
          onRetry={onRetry} onOpen={onOpen} onDisplayRecord={onDisplayRecord} />
      ))}
    </Modal>
  );
}
