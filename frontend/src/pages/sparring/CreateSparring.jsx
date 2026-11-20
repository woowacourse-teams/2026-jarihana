import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, Camera, ChevronDown, Plus, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { createSparring } from "../../features/sparring/api";
import { uploadImage, validateImageFile } from "../../features/image-upload";
import "./sparring-create.css";
import { Button, Modal, TextField, Textarea } from "../../shared/ui";
import { DateRangeCalendar } from "../../shared/ui/DateRangeCalendar.jsx";
import { addDateDays, formatEndpointDate, monthStart, parseDateValue } from "../../shared/ui/dateRangeUtils.js";

const presets = [{ days: 1, label: "내일" }, { days: 3, label: "3일 뒤" }, { days: 7, label: "1주일 뒤" }, { days: 15, label: "15일 뒤" }];
const todayInSeoul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function DeadlinePicker({ value, onChange, disabled, error }) {
  const today = todayInSeoul();
  const customDate = !presets.some(({ days }) => value === addDateDays(today, days));
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(value));
  const root = useRef(null);
  const trigger = useRef(null);
  const popover = useRef(null);
  const calendarId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape" && root.current?.contains(document.activeElement)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = root.current?.closest('[role="dialog"]');
    if (!dialog || !popover.current) return;
    const overflow = popover.current.getBoundingClientRect().bottom - dialog.getBoundingClientRect().bottom;
    if (overflow > 0) dialog.scrollTop += overflow;
  }, [open, visibleMonth]);

  function chooseDate(date) {
    onChange(date);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <fieldset className="ui-date-range sparring-create-form__deadline" ref={root}>
      <legend>마감일</legend>
      <div className="sparring-create-deadline-row">
        <div className="ui-date-range__presets" role="group" aria-label="마감일 빠른 선택">
          {presets.map(({ days, label }) => (
            <button key={days} type="button" disabled={disabled} aria-pressed={value === addDateDays(today, days)}
              data-ph-capture-attribute-action="sparring_deadline_preset"
              onClick={() => { onChange(addDateDays(today, days)); setOpen(false); }}>
              {label}
            </button>
          ))}
        </div>
        <div className="ui-date-range__endpoint-field">
          <button ref={trigger} type="button" className={`ui-date-range__endpoint-button${customDate ? " is-custom" : ""}`}
            name="closesAt" aria-label="마감 날짜 선택" aria-expanded={open} aria-controls={calendarId} disabled={disabled}
            aria-describedby={`${calendarId}-hint`}
            title={`마감일 ${formatEndpointDate(value)}`}
            data-ph-capture-attribute-action="sparring_deadline_open"
            onClick={() => { setVisibleMonth(monthStart(value)); setOpen((current) => !current); }}>
            <CalendarDays size={18} aria-hidden="true" />
            <strong>{formatEndpointDate(value)}</strong>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && <div className="sparring-create-calendar" id={calendarId} ref={popover}>
        <DateRangeCalendar activeEndpoint="start" startDate={value} endDate="" startValue="" label="마감일"
          minimumDate={today} todayDate={today} visibleMonth={visibleMonth} onMonthChange={setVisibleMonth} onSelect={chooseDate} />
      </div>}
      <p className="sparring-create-form__deadline-hint" id={`${calendarId}-hint`} role={error ? "alert" : undefined}>
        {error || "한국 시간 기준, 선택한 날짜가 끝나면 마감돼요."}
      </p>
    </fieldset>
  );
}

export function CreateSparring({ open, onClose }) {
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: createSparring,
    onSuccess: ({ id }) => navigate(`/sparring/${id}`)
  });
  const resetCreation = create.reset;
  useEffect(() => { if (!open) resetCreation(); }, [open, resetCreation]);
  return (
    <Modal open={open} onClose={onClose} title="토론 만들기" description="주제 하나, 두 생각이면 시작할 수 있어요." panelClassName="sparring-create-dialog"
      dismissible={!create.isPending} closeAction="sparring_create_dismiss">
      {open && <CreateSparringForm create={create} />}
    </Modal>
  );
}

function CreateSparringForm({ create }) {
  const [draft, setDraft] = useState(() => ({ title: "", a: "", b: "", description: "", closesAt: addDateDays(todayInSeoul(), 1) }));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const [errors, setErrors] = useState({});
  const [photo, setPhoto] = useState(null);
  const [upload, setUpload] = useState({ pending: false, key: null, error: "" });
  const form = useRef(null);
  const fileInput = useRef(null);
  const uploadSequence = useRef(0);
  const submitting = useRef(false);

  useEffect(() => () => { uploadSequence.current += 1; }, []);
  useEffect(() => {
    if (!photo) return undefined;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  function change(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }
  async function sendPhoto(file) {
    const sequence = ++uploadSequence.current;
    setUpload({ pending: true, key: null, error: "" });
    try {
      const result = await uploadImage(file);
      if (sequence === uploadSequence.current) setUpload({ pending: false, key: result.imageKey, error: "" });
    } catch (error) {
      if (sequence === uploadSequence.current) setUpload({ pending: false, key: null, error: error?.userMessage || "사진을 올리지 못했어요. 다시 시도해 주세요." });
    }
  }
  function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      validateImageFile(file);
      setErrors((current) => ({ ...current, photo: "" }));
      setPhoto({ file, url: URL.createObjectURL(file) });
      void sendPhoto(file);
    } catch (error) {
      setErrors((current) => ({ ...current, photo: error?.userMessage || "사진 파일을 확인해 주세요." }));
    }
  }
  function removePhoto() {
    uploadSequence.current += 1;
    setPhoto(null);
    setUpload({ pending: false, key: null, error: "" });
    setErrors((current) => ({ ...current, photo: "" }));
  }
  async function submit(event) {
    event.preventDefault();
    if (create.isPending || submitting.current) return;
    const nextErrors = {};
    if (!draft.title.trim()) nextErrors.title = "토론할 주제를 적어주세요.";
    if (!draft.a.trim()) nextErrors.a = "첫 번째 생각을 적어주세요.";
    if (!draft.b.trim()) nextErrors.b = "두 번째 생각을 적어주세요.";
    else if (draft.a.trim().toLowerCase() === draft.b.trim().toLowerCase()) nextErrors.b = "서로 다른 두 생각을 적어주세요.";
    if (!parseDateValue(draft.closesAt) || draft.closesAt < todayInSeoul()) {
      nextErrors.closesAt = "오늘 이후의 마감일을 선택해 주세요.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const first = Object.keys(nextErrors)[0];
      form.current?.querySelector(`[name="${first}"]`)?.focus();
      return;
    }
    if (upload.pending || (photo && !upload.key)) return;
    submitting.current = true;
    try {
      await create.mutateAsync({
        title: draft.title.trim(), a: draft.a.trim(), b: draft.b.trim(), description: draft.description.trim(),
        closesAt: new Date(`${draft.closesAt}T23:59:59.999+09:00`).toISOString(),
        ...(upload.key ? { representativeImageKey: upload.key } : {})
      });
    } catch {
      // The mutation keeps the server error visible and the draft intact for retry.
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form ref={form} noValidate className="sparring-create-form" onSubmit={submit}
      aria-busy={create.isPending || undefined} data-ph-private data-ph-capture-attribute-action="sparring_create_submit">
      <div className="sparring-create-topic">
        <TextField label="토론 주제" name="title" required maxLength={80}
          value={draft.title} error={errors.title} onChange={change} disabled={create.isPending}
          placeholder="예: 쉬는 날, 집콕 vs 나들이?" data-ph-capture-attribute-action="sparring_topic_edit" />
      </div>
      <div className="sparring-create-form__choice-grid">
        <span className="sparring-create-form__versus" aria-hidden="true">VS</span>
        {[["a", "첫 번째 생각", "예: 집콕"], ["b", "두 번째 생각", "예: 나들이"]].map(([name, label, placeholder]) => (
          <div className={`sparring-create-form__choice sparring-create-form__choice--${name}`} key={name}>
            <div className="sparring-create-form__portrait" style={{ backgroundImage: 'url("/sparring-arena/assets/entry-rivals.webp")' }} aria-hidden="true" />
            <TextField label={label} name={name} required maxLength={32}
              value={draft[name]} error={errors[name]} onChange={change} disabled={create.isPending} placeholder={placeholder}
              data-ph-capture-attribute-action="sparring_topic_edit" />
          </div>
        ))}
      </div>
      <div className="sparring-create-settings">
        <DeadlinePicker value={draft.closesAt} disabled={create.isPending} error={errors.closesAt}
          onChange={(date) => { setDraft((current) => ({ ...current, closesAt: date })); setErrors((current) => ({ ...current, closesAt: "" })); }} />
        <div className="sparring-create-details">
          <button type="button" className="sparring-create-details__toggle" aria-expanded={detailsOpen} aria-controls={detailsId}
            disabled={create.isPending} onClick={() => setDetailsOpen((current) => !current)}
            data-ph-capture-attribute-action="sparring_create_options_toggle">
            <Plus size={18} aria-hidden="true" />
            <span>설명·사진 추가</span>
            <span className="sparring-create-details__summary">
              {[draft.description.trim() && "설명 추가됨", photo && "사진 추가됨"].filter(Boolean).join(" · ") || "선택"}
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <div className="sparring-create-details__content" id={detailsId} hidden={!detailsOpen}>
            <Textarea label="설명 (선택)" name="description" maxLength={240} rows={3}
              value={draft.description} onChange={change} disabled={create.isPending} placeholder="상황을 조금 더 알려주세요."
              data-ph-capture-attribute-action="sparring_description_edit" />
            <div className="sparring-create-photo">
              <button type="button" className="sparring-create-photo__choose"
                disabled={create.isPending} onClick={() => fileInput.current?.click()} aria-label={photo ? "사진 변경" : "사진 선택"}
                data-ph-capture-attribute-action="sparring_image_choose">
                {photo ? <img src={photo.url} alt="선택한 대표사진 미리보기" /> : <Camera size={24} aria-hidden="true" />}
                <span><strong>{photo ? "사진 바꾸기" : "사진 추가하기"}</strong><small>JPG, PNG, WEBP · 최대 5MB</small></span>
              </button>
              {photo && <button type="button" className="sparring-create-photo__remove" disabled={create.isPending}
                onClick={removePhoto} aria-label="대표사진 제거" data-ph-capture-attribute-action="sparring_image_remove">제거</button>}
              <input type="file" ref={fileInput} hidden accept="image/jpeg,image/png,image/webp" aria-label="대표사진 파일"
                disabled={create.isPending} onChange={choosePhoto} data-ph-capture-attribute-action="sparring_image_upload" />
            </div>
          </div>
        </div>
        {upload.pending && <p className="sparring-create-photo__status" role="status">사진 올리는 중…</p>}
        {(errors.photo || upload.error) && <div className="sparring-create-photo__error" role="alert">
          <p>{errors.photo || upload.error}</p>
          {upload.error && photo && <Button variant="tertiary" size="sm" onClick={() => void sendPhoto(photo.file)}
            data-ph-capture-attribute-action="sparring_image_retry"><RefreshCw size={15} aria-hidden="true" />다시 올리기</Button>}
        </div>}
        {create.error && <p role="alert">{create.error.userMessage || create.error.message}</p>}
        <div className="sparring-create-form__actions">
          <Button type="submit" pending={create.isPending}
            disabled={upload.pending || Boolean(photo && !upload.key)}
            data-ph-capture-attribute-action="sparring_create_submit">
            토론 만들기
          </Button>
        </div>
      </div>
    </form>
  );
}
