import { useState } from "react";

import { useReplaceSessionSchedule } from "../../features/group/index.js";
import { Button, Modal, TextField } from "../../shared/ui/index.js";

function SessionForm({ schedule, onSave, saving, error }) {
  const [sessionDate, setSessionDate] = useState(schedule.sessionDate);
  const [startTime, setStartTime] = useState(schedule.startTime?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(schedule.endTime?.slice(0, 5) ?? "");
  const [validation, setValidation] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!sessionDate || !startTime || !endTime || startTime >= endTime) {
      setValidation("날짜와 시작·종료 시각을 확인해 주세요.");
      return;
    }
    setValidation("");
    onSave({ sessionDate, startTime, endTime });
  }

  return <form className="group-calendar-form" onSubmit={submit}>
    <TextField label="진행 날짜" onChange={(event) => setSessionDate(event.currentTarget.value)} required type="date" value={sessionDate} />
    <div className="group-calendar-form__row">
      <TextField label="시작 시각" onChange={(event) => setStartTime(event.currentTarget.value)} required type="time" value={startTime} />
      <TextField label="종료 시각" onChange={(event) => setEndTime(event.currentTarget.value)} required type="time" value={endTime} />
    </div>
    {validation || error ? <p className="group-calendar-form__error" role="alert">{validation || error}</p> : null}
    <div className="group-calendar-form__actions"><Button disabled={saving} type="submit">일정 저장</Button></div>
  </form>;
}

export function GroupSessionManageDialog({ groupId, open, schedule, onClose }) {
  const mutation = useReplaceSessionSchedule(groupId);

  async function save(values) {
    try {
      await mutation.mutateAsync(values);
      onClose();
    } catch { /* Keep the form open and show the error. */ }
  }

  function close() { mutation.reset(); onClose(); }

  return <Modal closeAction="group_session_manage_dismiss" onClose={close} open={open} title="같이해요 일정 수정">
    {open && schedule ? <SessionForm error={mutation.error?.userMessage ||
      (mutation.error ? "일정을 저장하지 못했어요. 다시 시도해 주세요." : null)}
      key={`${schedule.sessionDate}:${schedule.startTime}:${schedule.endTime}`}
      onSave={save} saving={mutation.isPending} schedule={schedule} /> : null}
  </Modal>;
}
