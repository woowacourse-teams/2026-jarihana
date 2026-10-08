import { readGroupBrowseFilters } from "../features/group/browseFilters.js";
import { groupQueryOptions, infiniteGroupsQueryOptions } from "../features/group/hooks.js";

export function createGroupDetailLoader(queryClient) {
  return async ({ params }) => {
    await queryClient.prefetchQuery({
      ...groupQueryOptions(params.groupId),
      retry: false
    });

    return null;
  };
}

export function createGroupBrowseLoader(queryClient) {
  return async ({ request }) => {
    const filters = readGroupBrowseFilters(new URL(request.url).searchParams);
    const options = infiniteGroupsQueryOptions(filters);
    if (queryClient.getQueryData(options.queryKey) === undefined) {
      await queryClient.prefetchInfiniteQuery({ ...options, retry: false });
    }
    return null;
  };
}

export function shouldRevalidateGroupBrowse({ currentUrl, nextUrl, defaultShouldRevalidate }) {
  if (currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) {
    return false;
  }
  return defaultShouldRevalidate;
}
