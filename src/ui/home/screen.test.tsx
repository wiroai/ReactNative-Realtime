import React from 'react';
import { AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { FakeConversationController } from '../conversation/support/fakeConversationController';
import { FakeSpeechController } from '../speech/support/fakeSpeechController';
import { FakeTranscriptionController } from '../transcription/support/fakeTranscriptionController';
import { HomeScreen } from './screen';

type AppStateChangeHandler = (nextState: string) => void;

/**
 * The unfocused tabs render under an `aria-hidden` ancestor — RNTL's
 * default queries skip hidden subtrees, so the "-hidden" testIDs this
 * suite asserts on need `includeHiddenElements` explicitly.
 */
function getByTestIdEvenHidden(testID: string) {
  return screen.getByTestId(testID, { includeHiddenElements: true });
}

/**
 * Paper's navigation bar ignores touches until it has been laid out
 * once, and RNTL never delivers layout events on its own.
 */
async function layOutTabBar(): Promise<void> {
  await fireEvent(screen.getByTestId('bottom-navigation-bar'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 80 } },
  });
}

async function renderHome() {
  const controllers = {
    conversation: new FakeConversationController(),
    transcription: new FakeTranscriptionController(),
    speech: new FakeSpeechController(),
  };
  await render(
    <PaperProvider>
      <NavigationContainer>
        <HomeScreen controllers={controllers} />
      </NavigationContainer>
    </PaperProvider>,
  );
  await layOutTabBar();
  return controllers;
}

describe('HomeScreen tab switching', () => {
  it('mounts every destination and starts on Conversation', async () => {
    await renderHome();

    expect(screen.getByTestId('conversation-visible')).toBeOnTheScreen();
    expect(getByTestIdEvenHidden('transcription-hidden')).toBeOnTheScreen();
    expect(getByTestIdEvenHidden('speech-hidden')).toBeOnTheScreen();
  });

  it('switches visibility when a different tab is selected', async () => {
    await renderHome();
    await fireEvent.press(screen.getByTestId('tab-transcription'));

    expect(getByTestIdEvenHidden('conversation-hidden')).toBeOnTheScreen();
    expect(screen.getByTestId('transcription-visible')).toBeOnTheScreen();
    expect(getByTestIdEvenHidden('speech-hidden')).toBeOnTheScreen();
  });

  it('keeps a conversation mounted (not torn down) when switching away', async () => {
    const controllers = await renderHome();
    await act(() => {
      controllers.conversation.setSnapshot({
        ...controllers.conversation.snapshot,
        userTranscript: 'hello',
      });
    });

    await fireEvent.press(screen.getByTestId('tab-speech'));
    await fireEvent.press(screen.getByTestId('tab-conversation'));

    expect(controllers.conversation.snapshot.userTranscript).toBe('hello');
    expect(screen.getByTestId('conversation-visible')).toBeOnTheScreen();
  });

  it('hangs up transcription and speech when their tab loses focus', async () => {
    const controllers = await renderHome();

    await fireEvent.press(screen.getByTestId('tab-transcription'));
    expect(controllers.conversation.suspendCalls).toBeGreaterThan(0);

    const stopCallsBeforeLeaving = controllers.transcription.stopCalls;
    await fireEvent.press(screen.getByTestId('tab-speech'));
    expect(controllers.transcription.stopCalls).toBeGreaterThan(stopCallsBeforeLeaving);
  });
});

describe('HomeScreen app-background lifecycle', () => {
  function captureAppStateHandler(): { fire: AppStateChangeHandler } {
    const listener = jest.spyOn(AppState, 'addEventListener');
    const box: { fire: AppStateChangeHandler } = { fire: () => {} };
    listener.mockImplementation((_event, handler) => {
      box.fire = handler as AppStateChangeHandler;
      return { remove: jest.fn() };
    });
    return box;
  }

  it('suspends conversation and stops the other two when the app backgrounds', async () => {
    const handler = captureAppStateHandler();
    const controllers = await renderHome();

    await act(() => {
      handler.fire('background');
    });

    expect(controllers.conversation.suspendCalls).toBeGreaterThan(0);
    expect(controllers.transcription.stopCalls).toBeGreaterThan(0);
    expect(controllers.speech.stopCalls).toBeGreaterThan(0);
  });

  it('resumes conversation on return from background while its tab is visible', async () => {
    const handler = captureAppStateHandler();
    const controllers = await renderHome();

    await act(() => {
      handler.fire('background');
    });
    await act(() => {
      handler.fire('active');
    });

    expect(controllers.conversation.resumeCalls).toBeGreaterThan(0);
  });

  it('does not resume conversation on return from background while another tab is visible', async () => {
    const handler = captureAppStateHandler();
    const controllers = await renderHome();
    await fireEvent.press(screen.getByTestId('tab-speech'));

    await act(() => {
      handler.fire('background');
    });
    const resumeCallsAfterBackground = controllers.conversation.resumeCalls;
    await act(() => {
      handler.fire('active');
    });

    expect(controllers.conversation.resumeCalls).toBe(resumeCallsAfterBackground);
  });

  it('ignores the transient inactive state', async () => {
    const handler = captureAppStateHandler();
    const controllers = await renderHome();
    const suspendCallsBefore = controllers.conversation.suspendCalls;
    const transcriptionStopCallsBefore = controllers.transcription.stopCalls;
    const speechStopCallsBefore = controllers.speech.stopCalls;

    await act(() => {
      handler.fire('inactive');
    });

    expect(controllers.conversation.suspendCalls).toBe(suspendCallsBefore);
    expect(controllers.transcription.stopCalls).toBe(transcriptionStopCallsBefore);
    expect(controllers.speech.stopCalls).toBe(speechStopCallsBefore);
  });
});
