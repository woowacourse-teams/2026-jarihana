import { useRef, useState } from "react";

export function useSubmissionLock() {
  const active = useRef(false);
  const [pending, setPending] = useState(false);

  async function run(operation) {
    if (active.current) return undefined;
    active.current = true;
    setPending(true);
    try {
      return await operation();
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  return { pending, run };
}
