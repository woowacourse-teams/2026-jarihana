export function focusInvalidField(container, name) {
  const field = container?.querySelector(`[name="${name}"]`);
  if (!field) return;

  field.focus({ preventScroll: true });
  const target = field.closest(".group-editor__field, .ui-field") ?? field;
  target.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center"
  });
}
