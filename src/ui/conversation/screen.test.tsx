import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { ViewStatus } from '../../app/viewStatus';
import { RealtimeSessionState } from '../../realtime/sessionState';
import { FakeConversationController } from './support/fakeConversationController';
import { ConversationScreen } from './screen';

function renderScreen(controller: FakeConversationController, isVisible = true) {
  return render(
    <PaperProvider>
      <ConversationScreen controller={controller} isVisible={isVisible} />
    </PaperProvider>,
  );
}

describe('ConversationScreen start/stop visibility', () => {
  it('shows only Start in the empty stage', async () => {
    const controller = new FakeConversationController();
    await renderScreen(controller);

    expect(screen.getByTestId('start-conversation')).toBeEnabled();
    expect(screen.queryByTestId('cancel-conversation')).toBeNull();
    expect(screen.queryByTestId('stop-conversation')).toBeNull();
  });

  it('shows only Cancel while connecting', async () => {
    const controller = new FakeConversationController();
    controller.setSnapshot({
      ...controller.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.CreatingTask,
    });
    await renderScreen(controller);

    expect(screen.getByTestId('cancel-conversation')).toBeOnTheScreen();
    expect(screen.queryByTestId('start-conversation')).toBeNull();
    expect(screen.queryByTestId('stop-conversation')).toBeNull();
  });

  it('shows the live toolbar with Stop once streaming', async () => {
    const controller = new FakeConversationController();
    controller.setSnapshot({
      ...controller.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Streaming,
      microphoneActive: true,
    });
    await renderScreen(controller);

    expect(screen.getByTestId('stop-conversation')).toBeOnTheScreen();
    expect(screen.getByTestId('mute-conversation')).toBeOnTheScreen();
    expect(screen.queryByTestId('start-conversation')).toBeNull();
    expect(screen.queryByTestId('cancel-conversation')).toBeNull();
  });

  it('offers Try again with the failure message when there are no transcripts', async () => {
    const controller = new FakeConversationController();
    controller.setSnapshot({
      ...controller.snapshot,
      status: ViewStatus.Error,
      sessionState: RealtimeSessionState.Failure,
      errorMessage: 'The conversation session could not be completed.',
    });
    await renderScreen(controller);

    expect(screen.getByText('The conversation session could not be completed.')).toBeOnTheScreen();
    expect(screen.getByTestId('start-conversation')).toBeEnabled();
  });

  it('taps Start and Stop through to the controller', async () => {
    const controller = new FakeConversationController();
    await renderScreen(controller);
    await fireEvent.press(screen.getByTestId('start-conversation'));
    expect(controller.startCalls).toBe(1);

    await act(() => {
      controller.setSnapshot({
        ...controller.snapshot,
        sessionState: RealtimeSessionState.Streaming,
      });
    });
    await fireEvent.press(screen.getByTestId('stop-conversation'));
    expect(controller.stopCalls).toBe(1);
  });

  it('suspends when the tab loses focus and resumes when it regains it', async () => {
    const controller = new FakeConversationController();
    const { rerender } = await renderScreen(controller, true);
    await rerender(
      <PaperProvider>
        <ConversationScreen controller={controller} isVisible={false} />
      </PaperProvider>,
    );
    expect(controller.suspendCalls).toBeGreaterThan(0);

    await rerender(
      <PaperProvider>
        <ConversationScreen controller={controller} isVisible={true} />
      </PaperProvider>,
    );
    expect(controller.resumeCalls).toBeGreaterThan(0);
  });
});
