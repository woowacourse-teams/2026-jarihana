import { groupQueryOptions } from "../features/group/hooks.js";

export function createGroupDetailLoader(queryClient) {
  return async ({ params }) => {
    await queryClient.prefetchQuery({
      ...groupQueryOptions(params.groupId),
      retry: false
    });

    return null;
  };
}
