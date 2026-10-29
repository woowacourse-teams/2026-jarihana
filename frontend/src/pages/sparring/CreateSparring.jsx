import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { createSparring } from "../../features/sparring/api";
import { Button, Modal } from "../../shared/ui";

export function CreateSparring({ open, onClose }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState({ title: "", a: "", b: "", description: "" });
  const create = useMutation({
    mutationFn: createSparring,
    onSuccess: ({ id }) => navigate(`/sparring/${id}`)
  });
  function change(event) {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
  }
  function submit(event) {
    event.preventDefault();
    if (!create.isPending)
      create.mutate(
        Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]))
      );
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="무슨 이야기로 붙어볼까?"
      closeAction="sparring_create_dismiss"
    >
      <form
        className="sparring-create-form"
        onSubmit={submit}
        data-ph-capture-attribute-action="sparring_create_submit"
      >
        {[
          ["title", "주제", 80],
          ["a", "민트 편의 생각", 32],
          ["b", "코랄 편의 생각", 32]
        ].map(([name, label, max]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              required
              maxLength={max}
              value={draft[name]}
              onChange={change}
              disabled={create.isPending}
              data-ph-capture-attribute-action="sparring_topic_edit"
            />
          </label>
        ))}
        <label>
          설명 (선택)
          <textarea
            name="description"
            maxLength={240}
            rows={3}
            value={draft.description}
            onChange={change}
            disabled={create.isPending}
            data-ph-capture-attribute-action="sparring_description_edit"
          />
        </label>
        {draft.a.trim() && draft.a.trim() === draft.b.trim() && (
          <p role="alert">서로 다른 두 입장을 적어주세요.</p>
        )}
        {create.error && <p role="alert">{create.error.message}</p>}
        <Button
          type="submit"
          pending={create.isPending}
          disabled={!draft.a.trim() || draft.a.trim() === draft.b.trim()}
          data-ph-capture-attribute-action="sparring_create_submit"
        >
          스파링 열기
        </Button>
      </form>
    </Modal>
  );
}
