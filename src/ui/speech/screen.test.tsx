import React from 'react';
import { Keyboard } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { FakeSpeechController } from './support/fakeSpeechController';
import { SpeechScreen } from './screen';

function renderScreen(controller: FakeSpeechController) {
  return render(
    <PaperProvider>
      <SpeechScreen controller={controller} isVisible />
    </PaperProvider>,
  );
}

describe('SpeechScreen Play button', () => {
  it('disables Play while the prompt is empty', async () => {
    const controller = new FakeSpeechController();
    await renderScreen(controller);

    expect(screen.getByTestId('play-speech')).toBeDisabled();
  });

  it('enables Play once text is entered, and disables it again when cleared', async () => {
    const controller = new FakeSpeechController();
    await renderScreen(controller);

    await fireEvent.changeText(screen.getByTestId('tts-prompt'), 'Hello there');
    expect(screen.getByTestId('play-speech')).toBeEnabled();

    await fireEvent.changeText(screen.getByTestId('tts-prompt'), '');
    expect(screen.getByTestId('play-speech')).toBeDisabled();
  });

  it('does not start a session while the prompt is blank', async () => {
    const controller = new FakeSpeechController();
    await renderScreen(controller);

    await fireEvent.press(screen.getByTestId('play-speech'));
    expect(controller.startCalls).toBe(0);
  });

  it('starts once text is entered and Play is pressed', async () => {
    const controller = new FakeSpeechController();
    await renderScreen(controller);

    await fireEvent.changeText(screen.getByTestId('tts-prompt'), 'Hello there');
    await fireEvent.press(screen.getByTestId('play-speech'));
    expect(controller.startCalls).toBe(1);
    expect(controller.prompt).toBe('Hello there');
  });

  it('dismisses the keyboard on a tap outside the prompt', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const controller = new FakeSpeechController();
    await renderScreen(controller);

    await fireEvent.press(screen.getByTestId('speech-stage'));
    expect(dismiss).toHaveBeenCalledTimes(1);

    // An enabled control keeps its own press; only the stage dismisses.
    await fireEvent.changeText(screen.getByTestId('tts-prompt'), 'Hello there');
    await fireEvent.press(screen.getByTestId('play-speech'));
    expect(controller.startCalls).toBe(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('hangs up when the tab loses focus while playing', async () => {
    const controller = new FakeSpeechController();
    const { rerender } = await renderScreen(controller);

    await rerender(
      <PaperProvider>
        <SpeechScreen controller={controller} isVisible={false} />
      </PaperProvider>,
    );

    expect(controller.stopCalls).toBe(1);
  });
});
