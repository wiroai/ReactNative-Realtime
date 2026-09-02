export async function waitUntil(
  condition: () => boolean,
  attempts = 100,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise<void>(resolve => setTimeout(() => resolve(), 5));
  }
}
