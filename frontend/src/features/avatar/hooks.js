import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/index.js";
import { getMyAvatar } from "./api.js";

export function useMyAvatar() {
  const { member, sessionVersion } = useAuth();
  return useQuery({
    queryKey: ["member-avatar", member?.id, sessionVersion],
    queryFn: ({ signal }) => getMyAvatar({ signal }),
    enabled: Boolean(member),
    staleTime: 0
  });
}
