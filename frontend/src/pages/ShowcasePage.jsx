import {
  Avatar,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  FilterBar,
  ForbiddenState,
  GroupCard,
  IconButton,
  Modal,
  NotFoundState,
  PageContainer,
  PageHeader,
  Radio,
  RecruitmentCard,
  SearchField,
  SectionHeader,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
  TextField,
  ToastProvider,
  useToast
} from "../shared/ui/index.js";

const longCopy =
  "처음 참여하는 분도 부담 없이 자기 속도로 이야기를 나누고, 서로의 배움을 안전하게 이어 갈 수 있는 모임입니다.";

function ToastControls() {
  const toast = useToast();
  return (
    <div className="ui-showcase__row">
      <Button
        onClick={() =>
          toast.success({ title: "저장했어요", description: "변경한 모임 정보가 반영됐습니다." })
        }
      >
        성공 알림
      </Button>
      <Button
        onClick={() =>
          toast.danger({
            title: "저장하지 못했어요",
            description: "연결을 확인하고 다시 시도해 주세요."
          })
        }
        variant="danger"
      >
        오류 알림
      </Button>
    </div>
  );
}

function ShowcaseContent() {
  return (
    <PageContainer className="ui-showcase">
      <PageHeader
        description="키보드, 긴 한국어 문장, 오류, 비활성, 로딩 상태를 한 화면에서 검수합니다."
        eyebrow="Development only"
        title="자리하나 UI Primitive Showcase"
      />

      <section className="ui-showcase__section">
        <SectionHeader description="44px 이상 target과 모든 상호작용 상태" title="버튼과 상태" />
        <div className="ui-showcase__row">
          <Button>모임 둘러보기</Button>
          <Button variant="secondary">나중에 하기</Button>
          <Button variant="tertiary">자세히 보기</Button>
          <Button variant="danger">모임 삭제</Button>
          <Button disabled>비활성</Button>
          <Button pending>저장하기</Button>
          <IconButton label="닫기" variant="secondary">
            ×
          </IconButton>
        </div>
        <div className="ui-showcase__row">
          <StatusBadge tone="brand">모집 중</StatusBadge>
          <StatusBadge tone="success">승인됨</StatusBadge>
          <StatusBadge tone="warning">승인 대기</StatusBadge>
          <StatusBadge tone="danger">거절됨</StatusBadge>
          <StatusBadge>모집 마감</StatusBadge>
          <Avatar alt="김자리" fallback="김" />
          <Avatar alt="이하나" fallback="이" size="lg" />
        </div>
      </section>

      <section className="ui-showcase__section">
        <SectionHeader description="label, description, error id를 control에 연결" title="입력" />
        <div className="ui-showcase__form ui-showcase__surface">
          <TextField
            description="한글 2~4자로 입력해 주세요."
            label="크루 이름"
            name="crewName"
            placeholder="예: 자리"
            required
          />
          <TextField
            error="이미 사용 중인 이름이에요."
            label="중복 오류"
            name="duplicate"
            value="자리"
            readOnly
          />
          <Textarea
            description={longCopy}
            label="모임 소개"
            name="description"
            placeholder="함께할 활동을 소개해 주세요."
          />
          <Select label="모임 유형" name="type" defaultValue="STUDY">
            <option value="CLUB">동아리</option>
            <option value="STUDY">스터디</option>
            <option value="SESSION">단기 모임</option>
          </Select>
          <SearchField
            label="모임 검색"
            name="keyword"
            placeholder="관심 있는 주제를 검색해 보세요"
          />
          <FilterBar label="모집 방식">
            <Radio defaultChecked label="자동 승인" name="joinMethod" value="AUTO" />
            <Radio label="모임장 승인" name="joinMethod" value="APPROVAL" />
            <Checkbox label="모집 중인 모임만 보기" name="recruiting" />
          </FilterBar>
        </div>
      </section>

      <section className="ui-showcase__section">
        <SectionHeader description="Figma의 rounded surface와 mint status grammar" title="카드" />
        <div className="ui-showcase__grid">
          <GroupCard
            group={{
              id: 1,
              introduction: longCopy,
              memberCount: 18,
              name: "처음이어도 괜찮은 프론트엔드 스터디",
              recruiting: true,
              type: "STUDY"
            }}
          />
          <GroupCard
            group={{
              id: 2,
              introduction: "주말마다 천천히 걷고 기록해요.",
              memberCount: 9,
              name: "한강 산책 기록 모임",
              recruiting: false,
              type: "CLUB"
            }}
          />
          <RecruitmentCard
            recruitment={{
              capacity: 12,
              joinMethod: "APPROVAL",
              status: "OPEN",
              title: "2026 하반기 멤버 모집"
            }}
          />
        </div>
      </section>

      <section className="ui-showcase__section">
        <SectionHeader description="Arrow key roving focus와 tabpanel 연결" title="탭" />
        <div className="ui-showcase__surface">
          <Tabs
            defaultValue="overview"
            items={[
              { label: "소개", value: "overview", content: <p>{longCopy}</p> },
              {
                label: "활동 기록",
                value: "activity",
                content: <p>최근 활동 기록이 아직 없어요.</p>
              },
              { label: "멤버", value: "members", content: <p>함께하는 멤버 18명</p> }
            ]}
          />
        </div>
      </section>

      <section className="ui-showcase__section">
        <SectionHeader
          description="focus trap, Escape, scroll lock, focus restore"
          title="오버레이와 알림"
        />
        <div className="ui-showcase__row">
          <Modal
            description="이 surface 안에서 Tab focus가 순환합니다."
            title="모임 소개"
            trigger={<Button variant="secondary">모달 열기</Button>}
          >
            <p>{longCopy}</p>
            <Button>확인</Button>
          </Modal>
          <ConfirmDialog
            danger
            description="삭제한 모임은 되돌릴 수 없어요."
            onConfirm={() => {}}
            title="정말 삭제할까요?"
            trigger={<Button variant="danger">확인 대화상자</Button>}
          />
          <Drawer title="전체 메뉴" trigger={<Button variant="secondary">드로어 열기</Button>}>
            <nav aria-label="드로어 메뉴">
              <a href="/groups">모임 둘러보기</a>
            </nav>
          </Drawer>
          <ToastControls />
        </div>
      </section>

      <section className="ui-showcase__section">
        <SectionHeader description="loading, empty, error, 403, 404" title="비동기와 복구 상태" />
        <div className="ui-showcase__grid">
          <div className="ui-showcase__surface">
            <Skeleton aria-label="모임 카드 불러오는 중" className="ui-showcase__skeleton" />
          </div>
          <EmptyState action={<Button>모임 만들기</Button>} />
          <ErrorState action={<Button variant="secondary">다시 시도</Button>} />
          <ForbiddenState action={<a href="/groups">모임으로 돌아가기</a>} />
          <NotFoundState action={<a href="/">홈으로 돌아가기</a>} />
        </div>
      </section>
    </PageContainer>
  );
}

export function ShowcasePage() {
  return (
    <ToastProvider>
      <ShowcaseContent />
    </ToastProvider>
  );
}
