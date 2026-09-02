/**
 * Official Wiro hosts confirmed from docs on 2026-08-31.
 *
 * Cancel and Kill were re-checked against Wiro MCP on 2026-09-01:
 * queued work uses `TASK_CANCEL` (`taskid`); a started task falls
 * through to `TASK_KILL` (`socketaccesstoken`).
 *
 * Direct LLM routes on `llm.wiro.ai` are out of scope. This app uses
 * asynchronous Run plus the task WebSocket.
 */
export const WiroEndpoints = {
  REST_BASE: 'https://api.wiro.ai/v1',
  SOCKET_URL: 'wss://socket.wiro.ai/v1',

  TASK_CANCEL: '/Task/Cancel',
  TASK_KILL: '/Task/Kill',

  runPath(owner: string, slug: string): string {
    return `/Run/${owner}/${slug}`;
  },
} as const;
