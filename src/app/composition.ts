import { BufferedPcmAudioRecorder } from '../audio/bufferedPcmAudioRecorder';
import { NativePcmCaptureSource } from '../audio/nativePcmCaptureSource';
import { NativePcmPlaybackSink } from '../audio/nativePcmPlaybackSink';
import { NativeRealtimeAudioSession } from '../audio/nativeRealtimeAudioSession';
import { PcmNoiseGate } from '../audio/pcmNoiseGate';
import { PcmPlaybackProfile } from '../audio/playback';
import { QueuedPcmAudioPlayer } from '../audio/queuedPcmAudioPlayer';
import { RealtimeSessionGuard } from '../audio/sessionGuard';
import { WiroAuthHeaders } from '../auth/authHeaders';
import { DefaultWiroApiClient } from '../networking/apiClient';
import { FetchWiroHttpClient } from '../networking/fetchHttpClient';
import { RealtimeSession } from '../realtime/session';
import { WebSocketRealtimeSocketClient } from '../realtime/webSocketClient';
import { SpeechToSpeechSessionService } from '../services/conversation/speechToSpeechSessionService';
import { TextToSpeechSessionService } from '../services/speech/textToSpeechSessionService';
import { SpeechToTextSessionService } from '../services/transcription/speechToTextSessionService';
import { HomeControllers } from '../ui/home/screen';
import { env } from './env';

/**
 * The one place `App.tsx` builds the real, native-backed session
 * services — everything `src/services` needs but must never import
 * itself (see the layout rules in `AGENTS.md`).
 *
 * One `RealtimeSessionGuard` and one `RealtimeAudioSession` are
 * shared by all three destinations, matching the single shared
 * native audio graph underneath; a fresh capture/playback adapter
 * per feature keeps their small subscription state from crossing
 * screens.
 */
export function createHomeControllers(): HomeControllers {
  const apiClient = new DefaultWiroApiClient(
    new FetchWiroHttpClient(),
    new WiroAuthHeaders({
      credentials: { apiKey: env.wiroApiKey, apiSecret: env.wiroApiSecret },
    }),
  );
  const audioSession = new NativeRealtimeAudioSession();
  const sessionGuard = new RealtimeSessionGuard();
  const sessionFactory = (taskId: string, taskToken: string) =>
    new RealtimeSession({
      socketClient: new WebSocketRealtimeSocketClient(),
      taskId,
      taskToken,
    });

  const conversation = new SpeechToSpeechSessionService({
    audioSession,
    apiClient,
    sessionFactory,
    recorder: new BufferedPcmAudioRecorder(new NativePcmCaptureSource()),
    player: new QueuedPcmAudioPlayer(new NativePcmPlaybackSink(), {
      profile: PcmPlaybackProfile.Conversation,
    }),
    sessionGuard,
    noiseGate: new PcmNoiseGate(),
  });

  const transcription = new SpeechToTextSessionService({
    audioSession,
    apiClient,
    sessionFactory,
    recorder: new BufferedPcmAudioRecorder(new NativePcmCaptureSource()),
    sessionGuard,
  });

  const speech = new TextToSpeechSessionService({
    audioSession,
    apiClient,
    sessionFactory,
    player: new QueuedPcmAudioPlayer(new NativePcmPlaybackSink(), {
      profile: PcmPlaybackProfile.Media,
    }),
    sessionGuard,
  });

  return { conversation, transcription, speech };
}
