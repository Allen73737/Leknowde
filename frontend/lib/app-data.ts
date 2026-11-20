import { cache } from "react";

import { safeGet } from "./server-api";
import type {
  DashboardResponse,
  JobsResponse,
  NotificationsResponse,
  RepositoriesResponse,
  RepositoryResponse,
  WorkspacesResponse,
} from "./types";

/**
 * Request-scoped data helpers. React's cache() deduplicates identical calls
 * made by a repository layout and its page during the same server render.
 */

export const getWorkspaces = cache(async () => safeGet<WorkspacesResponse>("/workspaces"));

export const getRepositoryBundle = cache(async (id: string) =>
  safeGet<RepositoryResponse>(`/repositories/${encodeURIComponent(id)}`),
);

export const getRepositoryJobs = cache(async (id: string) =>
  safeGet<JobsResponse>(`/repositories/${encodeURIComponent(id)}/jobs`),
);

export const getNotifications = cache(async () => safeGet<NotificationsResponse>("/notifications"));

export const getDashboard = cache(async () => safeGet<DashboardResponse>("/dashboard"));

export const getRepositoriesForWorkspace = cache(async (workspaceID: string) =>
  safeGet<RepositoriesResponse>(`/workspaces/${encodeURIComponent(workspaceID)}/repositories`),
);

export const getWorkspace = cache(async (workspaceID: string) =>
  safeGet<{ workspace: import("./types").Workspace; repositories: import("./types").Repository[] }>(
    `/workspaces/${encodeURIComponent(workspaceID)}`,
  ),
);
