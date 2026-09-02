/**
 * Task WebSocket frames confirmed from Wiro docs on 2026-08-31.
 *
 * Subscribe once after connect. Do not send PCM before
 * `TASK_STREAM_READY`. Audio bytes are
 * `UTF8(tasktoken + "|") + pcm`, signed Int16, 24 kHz, mono.
 */
export const WiroRealtimeProtocol = {
  TASK_INFO: 'task_info',
  TASK_SESSION_END: 'task_session_end',
  TASK_STREAM_READY: 'task_stream_ready',
  TASK_STREAM_END: 'task_stream_end',
  TASK_OUTPUT: 'task_output',
  TASK_COST: 'task_cost',
  TASK_END: 'task_end',
  TASK_POSTPROCESS_END: 'task_postprocess_end',
  TASK_ERROR: 'task_error',
  TASK_ERROR_FULL: 'task_error_full',
  TASK_CANCEL: 'task_cancel',

  TRANSCRIPT_USER_PREFIX: 'TRANSCRIPT_USER:',
  TRANSCRIPT_AI_PREFIX: 'TRANSCRIPT_AI:',

  BINARY_PREFIX_SEPARATOR: '|',
} as const;
