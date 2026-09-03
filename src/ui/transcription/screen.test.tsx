import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { ViewStatus } from '../../app/viewStatus';
import { RealtimeSessionState } from '../../realtime/sessionState';
import { FakeTranscriptionController } from './support/fakeTranscriptionController';
import { TranscriptionScreen } from './screen';

function renderScreen(controller: FakeTranscriptionController) {
  return render(
    <PaperProvider>
      <TranscriptionScreen controller={controller} isVisible />
    </PaperProvider>,
  );
}

describe('TranscriptionScreen start/stop visibility', () => {
  it('shows only Start in the empty stage', async () => {
    const controller = new FakeTranscriptionController();
    await renderScreen(controller);

    expect(screen.getByTestId('start-transcription')).toBeEnabled();
    expect(screen.queryByTestId('stop-transcription')).toBeNull();
  });

  it('shows Stop and Mute once recording', async () => {
    const controller = new FakeTranscriptionController();
    controller.setSnapshot({
      ...controller.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Streaming,
      microphoneActive: true,
    });
    await renderScreen(controller);

    expect(screen.getByTestId('stop-transcription')).toBeOnTheScreen();
    expect(screen.getByTestId('mute-transcription')).toBeOnTheScreen();
    expect(screen.queryByTestId('start-transcription')).toBeNull();

    await fireEvent.press(screen.getByTestId('stop-transcription'));
    expect(controller.stopCalls).toBe(1);
  });

  it('offers copy and clear once a transcript exists', async () => {
    const controller = new FakeTranscriptionController();
    controller.setSnapshot({ ...controller.snapshot, transcript: 'hello world' });
    await renderScreen(controller);

    expect(screen.getByTestId('copy-transcript')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Clear'));
    expect(controller.clearCalls).toBe(1);
  });

  it('hangs up when the tab loses focus while recording', async () => {
    const controller = new FakeTranscriptionController();
    controller.setSnapshot({
      ...controller.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Streaming,
      microphoneActive: true,
    });
    const { rerender } = await render(
      <PaperProvider>
        <TranscriptionScreen controller={controller} isVisible />
      </PaperProvider>,
    );

    await rerender(
      <PaperProvider>
        <TranscriptionScreen controller={controller} isVisible={false} />
      </PaperProvider>,
    );

    expect(controller.stopCalls).toBe(1);
  });
});
