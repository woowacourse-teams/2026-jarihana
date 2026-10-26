import { Link, useParams } from "react-router";

import { useAuth } from "../../features/auth/index.js";
import { useAnnouncementDetail } from "../../features/announcement/hooks.js";
import { useGroup } from "../../features/group/index.js";
import {
  Button,
  ErrorState,
  NotFoundState,
  PageContainer,
  Skeleton
} from "../../shared/ui/index.js";
import { formatCompactLocalDateTime } from "./pageUtils.js";
import "./announcements.css";

const SCOPE_LABELS = {
  MEMBERS: "모임원 공개",
  PUBLIC: "전체 공개"
};

export function AnnouncementDetailPage() {
  const { groupId, announcementId } = useParams();
  const auth = useAuth();
  const group = useGroup(groupId);
  const validAnnouncementId = /^[1-9]\d*$/.test(announcementId)
    && Number.isSafeInteger(Number(announcementId));
  const announcement = useAnnouncementDetail(
    groupId,
    validAnnouncementId ? announcementId : null,
    auth.member?.id,
    auth.sessionVersion
  );
  const listPath = `/groups/${groupId}?tab=announcements`;

  if (announcement.isLoading) {
    return (
      <PageContainer className="group-announcement-detail">
        <Skeleton aria-label="공지 불러오는 중" className="group-announcement-detail__skeleton" />
      </PageContainer>
    );
  }

  if (!validAnnouncementId || announcement.error?.status === 404) {
    return (
      <PageContainer className="group-announcement-detail">
        <Link
          className="group-announcement-back"
          data-ph-capture-attribute-action="group_announcement_list_return"
          to={listPath}
        >
          ← 공지 목록으로
        </Link>
        <NotFoundState
          action={<Link className="ui-button ui-button--primary ui-button--md" data-ph-capture-attribute-action="group_announcement_list_return" to={listPath}>공지 목록으로</Link>}
          description="삭제되었거나 현재 계정으로 볼 수 없는 공지예요."
          title="공지를 찾을 수 없어요"
        />
      </PageContainer>
    );
  }

  if (announcement.isError || !announcement.data) {
    return (
      <PageContainer className="group-announcement-detail">
        <Link
          className="group-announcement-back"
          data-ph-capture-attribute-action="group_announcement_list_return"
          to={listPath}
        >
          ← 공지 목록으로
        </Link>
        <ErrorState
          action={<Button data-ph-capture-attribute-action="group_announcement_detail_retry" onClick={() => void announcement.refetch()} variant="secondary">다시 시도</Button>}
          description="연결 상태를 확인하고 다시 시도해 주세요."
          title="공지를 불러오지 못했어요"
        />
      </PageContainer>
    );
  }

  const item = announcement.data;
  return (
    <PageContainer className="group-announcement-detail">
      <Link
        className="group-announcement-back"
        data-ph-capture-attribute-action="group_announcement_list_return"
        to={listPath}
      >
        ← 공지 목록으로
      </Link>
      <article className="group-announcement-article" data-ph-private>
        <p className="group-announcement-article__group">
          <Link
            data-ph-capture-attribute-action="group_announcement_group_open"
            to={`/groups/${groupId}`}
          >
            {group.data?.name ?? "모임"}
          </Link>
        </p>
        <span className={`group-announcement-scope group-announcement-scope--${item.scope.toLowerCase()}`}>
          {SCOPE_LABELS[item.scope]}
        </span>
        <h1>{item.title}</h1>
        <p className="group-announcement-article__meta">
          {item.authorNickname} · {formatCompactLocalDateTime(item.createdAt)}
        </p>
        <div className="group-announcement-article__content">{item.content}</div>
      </article>
    </PageContainer>
  );
}
