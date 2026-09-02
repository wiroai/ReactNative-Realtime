/**
 * Session breadcrumbs for a later debug panel.
 *
 * Tokens and credentials stay out of disk and the protocol log.
 */
export const RealtimeTrace = {
  line(message: string): void {
    if (!message) {
      return;
    }
  },
};
