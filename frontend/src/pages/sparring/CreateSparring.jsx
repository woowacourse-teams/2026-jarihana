import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, Camera, Check, ChevronDown, MessageCircle, Pencil, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { createSparring } from "../../features/sparring/api";
import { uploadImage, validateImageFile } from "../../features/image-upload";
import "./sparring-create.css";
import { Button, Modal, TextField, Textarea } from "../../shared/ui";
import { DateRangeCalendar } from "../../shared/ui/DateRangeCalendar.jsx";
import { addDateDays, formatEndpointDate, monthStart, parseDateValue } from "../../shared/ui/dateRangeUtils.js";
import defaultPhoto from "../../shared/assets/illustrations/sparring-create-photo-story.png";

const presets = [{ days: 1, label: "내일" }, { days: 3, label: "3일 뒤" }, { days: 7, label: "1주일 뒤" }, { days: 15, label: "15일 뒤" }];
const todayInSeoul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function DeadlinePicker({ value, onChange, disabled }) {
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
      <legend className="ui-sr-only">마감일</legend>
      <div className="sparring-create-deadline-row">
        <span className="sparring-create-deadline-label" aria-hidden="true"><CalendarDays size={27} />마감일</span>
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
            aria-label="마감 날짜 선택" aria-expanded={open} aria-controls={calendarId} disabled={disabled}
            title={`마감일 ${formatEndpointDate(value)}`}
            data-ph-capture-attribute-action="sparring_deadline_open"
            onClick={() => { setVisibleMonth(monthStart(value)); setOpen((current) => !current); }}>
            <CalendarDays size={23} aria-hidden="true" />
            <strong className={customDate ? undefined : "ui-sr-only"}>{formatEndpointDate(value)}</strong>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {open && <div className="ui-date-range__calendar-popover" id={calendarId} ref={popover}>
            <DateRangeCalendar activeEndpoint="start" startDate={value} endDate="" startValue="" label="마감일"
              minimumDate={today} todayDate={today} visibleMonth={visibleMonth} onMonthChange={setVisibleMonth} onSelect={chooseDate} />
          </div>}
        </div>
      </div>
      <p className="ui-sr-only">한국 시간 기준, 선택한 날짜가 끝나면 마감돼요.</p>
    </fieldset>
  );
}

const steps = ["주제", "두 가지 생각", "사진과 마감일"];
const stepHeadings = ["어떤 이야기를 나눠볼까요?", "서로 다른 두 생각을 들려주세요", "사진 한 장으로 주제를 보여주세요"];

export function CreateSparring({ open, onClose }) {
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: createSparring,
    onSuccess: ({ id }) => navigate(`/sparring/${id}`)
  });
  const resetCreation = create.reset;
  useEffect(() => { if (!open) resetCreation(); }, [open, resetCreation]);
  return (
    <Modal open={open} onClose={onClose} title="토론 만들기" panelClassName="sparring-create-dialog"
      dismissible={!create.isPending} closeAction="sparring_create_dismiss">
      {open && <CreateSparringForm create={create} />}
    </Modal>
  );
}

function CreateSparringForm({ create }) {
  const [draft, setDraft] = useState(() => ({ title: "", a: "", b: "", description: "", closesAt: addDateDays(todayInSeoul(), 1) }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [photo, setPhoto] = useState(null);
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const [upload, setUpload] = useState({ pending: false, key: null, error: "" });
  const form = useRef(null);
  const heading = useRef(null);
  const fileInput = useRef(null);
  const uploadSequence = useRef(0);
  const submitting = useRef(false);
  const previousStep = useRef(step);

  useEffect(() => () => { uploadSequence.current += 1; }, []);
  useEffect(() => {
    if (!photo) return undefined;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);
  useLayoutEffect(() => {
    if (step !== previousStep.current) heading.current?.focus({ preventScroll: true });
    previousStep.current = step;
  }, [step]);

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
      setPhotoSkipped(false);
      void sendPhoto(file);
    } catch (error) {
      setErrors((current) => ({ ...current, photo: error?.userMessage || "사진 파일을 확인해 주세요." }));
    }
  }
  function removePhoto() {
    uploadSequence.current += 1;
    setPhoto(null);
    setPhotoSkipped(true);
    setUpload({ pending: false, key: null, error: "" });
    setErrors((current) => ({ ...current, photo: "" }));
  }
  async function submit(event) {
    event.preventDefault();
    if (create.isPending || submitting.current) return;
    const nextErrors = {};
    if (step !== 1 && !draft.title.trim()) nextErrors.title = "토론할 주제를 적어주세요.";
    if (step >= 1) {
      if (!draft.a.trim()) nextErrors.a = "첫 번째 생각을 적어주세요.";
      if (!draft.b.trim()) nextErrors.b = "두 번째 생각을 적어주세요.";
      else if (draft.a.trim().toLowerCase() === draft.b.trim().toLowerCase()) nextErrors.b = "서로 다른 두 생각을 적어주세요.";
    }
    if (step === 2 && (!parseDateValue(draft.closesAt) || draft.closesAt < todayInSeoul())) {
      nextErrors.closesAt = "오늘 이후의 마감일을 선택해 주세요.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const first = Object.keys(nextErrors)[0];
      form.current?.querySelector(`[name="${first}"]`)?.focus();
      return;
    }
    if (step < steps.length - 1) { setStep(step + 1); return; }
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

  const topicInput = (
    <div className="sparring-create-topic">
      <TextField label="토론 주제" name="title" required maxLength={80}
        value={draft.title} error={errors.title} onChange={change} disabled={create.isPending}
        placeholder="예: 쉬는 날, 집콕 vs 나들이?" data-ph-capture-attribute-action="sparring_topic_edit" />
      <Pencil className="sparring-create-field-pencil" size={18} aria-hidden="true" />
    </div>
  );
  const choiceInputs = (
    <div className="sparring-create-form__choice-grid">
      {[["a", "첫 번째 생각", "예: 집에서 푹 쉬기"], ["b", "두 번째 생각", "예: 밖으로 기분 전환"]].map(([name, label, placeholder]) => (
        <div className={`sparring-create-form__choice sparring-create-form__choice--${name}`} key={name}>
          <MessageCircle className="sparring-create-choice-icon" size={33} aria-hidden="true" />
          <TextField label={label} name={name} required maxLength={32}
            value={draft[name]} error={errors[name]} onChange={change} disabled={create.isPending} placeholder={placeholder}
            data-ph-capture-attribute-action="sparring_topic_edit" />
          <Pencil className="sparring-create-field-pencil" size={18} aria-hidden="true" />
        </div>
      ))}
    </div>
  );

  return (
    <form ref={form} noValidate className="sparring-create-form" onSubmit={submit}
      aria-busy={create.isPending || undefined} data-ph-capture-attribute-action="sparring_create_submit">
      <ol className="sparring-create-progress" aria-label="토론 만들기 단계">
        {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}
          className={index <= step ? "is-complete" : ""}>
          <span className="sparring-create-progress__number" aria-hidden="true">{index < step ? <Check size={15} /> : index + 1}</span>
          <span>{label}</span>
        </li>)}
      </ol>
      <section className={`sparring-create-step sparring-create-step--${step}`} key={step} aria-labelledby="sparring-create-step-title">
        <div className="sparring-create-step__heading">
          <h3 id="sparring-create-step-title" ref={heading} tabIndex={-1}>{stepHeadings[step]}</h3>
          {step === 2 && !photoSkipped && <button type="button" className="sparring-create-photo__remove" disabled={create.isPending}
            onClick={removePhoto} aria-label="대표사진 제거" data-ph-capture-attribute-action="sparring_image_remove">사진 없이 만들기</button>}
        </div>
        {step === 0 && <>
          {topicInput}
          <Textarea label="설명 (선택)" name="description" maxLength={240} rows={3}
            value={draft.description} onChange={change} placeholder="상황을 조금 더 알려주세요."
            data-ph-capture-attribute-action="sparring_description_edit" />
        </>}
        {step === 1 && <><p className="sparring-create-topic-context">{draft.title}</p>{choiceInputs}</>}
        {step === 2 && <>
          <div className="sparring-create-photo">
            <button type="button" className={`sparring-create-photo__canvas${photoSkipped ? " is-skipped" : ""}`}
              disabled={create.isPending} onClick={() => fileInput.current?.click()} aria-label={photo ? "사진 변경" : "사진 선택"}
              title="JPG, PNG, WEBP · 최대 5MB"
              data-ph-capture-attribute-action="sparring_image_choose">
              {!photoSkipped && <img src={photo?.url || defaultPhoto} alt={photo ? "선택한 대표사진 미리보기" : ""} />}
              <span className="sparring-create-photo__choose"><Camera size={18} aria-hidden="true" />{photoSkipped ? "사진 추가하기" : "사진 바꾸기"}</span>
            </button>
            <input type="file" ref={fileInput} hidden accept="image/jpeg,image/png,image/webp" aria-label="대표사진 파일"
              disabled={create.isPending} onChange={choosePhoto} data-ph-capture-attribute-action="sparring_image_upload" />
          </div>
          {upload.pending && <p className="sparring-create-photo__status" role="status">사진 올리는 중…</p>}
          {(errors.photo || upload.error) && <div className="sparring-create-photo__error" role="alert">
            <p>{errors.photo || upload.error}</p>
            {upload.error && photo && <Button variant="tertiary" size="sm" onClick={() => void sendPhoto(photo.file)}
              data-ph-capture-attribute-action="sparring_image_retry"><RefreshCw size={15} aria-hidden="true" />다시 올리기</Button>}
          </div>}
          {topicInput}
          {choiceInputs}
          <DeadlinePicker value={draft.closesAt} disabled={create.isPending}
            onChange={(date) => { setDraft((current) => ({ ...current, closesAt: date })); setErrors((current) => ({ ...current, closesAt: "" })); }} />
          {errors.closesAt && <p role="alert">{errors.closesAt}</p>}
        </>}
      </section>
      {create.error && <p role="alert">{create.error.userMessage || create.error.message}</p>}
      <div className="sparring-create-form__actions">
        {step > 0 && <Button variant="secondary" disabled={create.isPending} onClick={() => { setErrors({}); setStep(step - 1); }}
          data-ph-capture-attribute-action="sparring_create_previous">이전</Button>}
        <Button type="submit" pending={create.isPending}
          disabled={step === 2 && (upload.pending || Boolean(photo && !upload.key))}
          data-ph-capture-attribute-action={step === 2 ? "sparring_create_submit" : "sparring_create_next"}>
          {step === 2 ? "토론 만들기" : "다음"}
        </Button>
      </div>
    </form>
  );
}
