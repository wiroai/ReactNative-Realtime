<div align="center">

<img src="https://wiro.ai/images/logos/logo/logo.png" alt="Wiro" width="180" />

# Wiro Realtime for React Native

**Official React Native example for live voice AI on
[Wiro](https://wiro.ai) — speech-to-speech conversation, realtime
transcription, and text-to-speech**

[![React Native](https://img.shields.io/badge/React%20Native-0.87-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![New Architecture](https://img.shields.io/badge/New%20Architecture-TurboModules-000000?style=for-the-badge)](#requirements)
[![MIT](https://img.shields.io/badge/license-MIT-6f42c1?style=for-the-badge)](LICENSE)

[Docs](https://wiro.ai/docs) · [Models](https://wiro.ai/models) ·
[Dashboard](https://wiro.ai/panel) ·
[Create Project](https://wiro.ai/panel/project/new)

</div>

## Preview

<p align="center">
  <img
    src="screenshots/conversation.png"
    alt="Wiro realtime conversation screen"
    width="30%"
  />
  <img
    src="screenshots/transcription.png"
    alt="Wiro realtime transcription screen"
    width="30%"
  />
  <img
    src="screenshots/speech.png"
    alt="Wiro realtime text-to-speech screen"
    width="30%"
  />
</p>

## What's inside

Three realtime audio flows, each a tab in the app, each backed by a
live Wiro model over one WebSocket protocol:

| Flow | Model | What it does |
| --- | --- | --- |
| Conversation | [`openai/gpt-realtime-mini`](https://wiro.ai/models) | Full-duplex voice chat with barge-in |
| Transcription | [`mistralai/voxtral-mini-4b-realtime-2602`](https://wiro.ai/models) | Live speech-to-text as you talk |
| Speech | [`openmoss/moss-tts-realtime`](https://wiro.ai/models) | Streaming text-to-speech playback |

The chrome is `react-native-paper` Material 3, all system
components: bottom tabs, app bars, a floating toolbar for the live
call controls, an animated level meter driven by the real
microphone level, chat-bubble transcripts, and Material loading
indicators while connecting. Light and dark Wiro themes follow the
system. There is no custom orb, wave, or tab bar.

## Features

- Live speech-to-speech conversation with voice activity detection,
  barge-in, and a noise gate
- Realtime microphone transcription with streaming partial results
- Streaming text-to-speech with bounded PCM playback
- One native audio graph per platform for capture and playback
  (`AudioRecord`/`AudioTrack` on Android, `AVAudioEngine` on iOS)
  behind a single `WiroPcmAudio` TurboModule, so the platform echo
  canceller (AEC) actually works
- Signed REST Run requests and the full Wiro realtime WebSocket
  protocol, in pure TypeScript
- Bounded capture/playback queues, safe PCM overflow shedding, audio
  route and interruption handling
- Cross-feature guard so two tabs never hold the microphone at once
- Automatic reconnect to the same task on socket drops, with a
  bounded restart budget
- Session lifecycle covered by Jest unit tests and fakes — no
  device needed to verify the plumbing

## Requirements

- Node 22.11+
- A **physical** Android or iOS phone — the emulator/simulator
  microphone is not a usable voice path
- Android: Android Studio (or the SDK) with compileSdk 37, minSdk 26
- iOS: Xcode with a valid signing team, CocoaPods, iOS 15.1+
- A [Wiro project and API key](https://wiro.ai/panel/project/new)

## Run

Install JavaScript dependencies:

```sh
npm install
```

Copy the credential template and set the key:

```sh
cp .env.example .env
```

Edit `.env`:

```
WIRO_API_KEY=YOUR_API_KEY
WIRO_API_SECRET=
```

`WIRO_API_SECRET` is only for signature-based Wiro projects. Leave
it empty for API-key-only projects. `.env` is gitignored.

Launch fails fast when `WIRO_API_KEY` is missing.

Then, on Android, plug in a physical phone and run:

```sh
npm run android
```

On iOS, install pods once, then run:

```sh
bundle install
cd ios && bundle exec pod install && cd ..
npm run ios -- --device
```

> **Credentials warning:** `.env` values are bundled into the app
> at build time via `react-native-config`. Never distribute builds
> containing real credentials — production apps should authenticate
> through a controlled backend or a short-lived credential flow.

## Make it yours

[`src/app/conversationConfig.ts`](src/app/conversationConfig.ts)
holds the persona, the voice, and the model. Editing that one file
is the whole of turning this example into a product.

```ts
PERSONA: '...who the assistant is...',
VOICE: 'marin',
```

Common changes:

- **Give the assistant a job** — rewrite `PERSONA`.
- **Change the voice** — set `VOICE` to any option the model catalog
  lists (`src/models/catalog.ts`).
- **Tune the engineering parameters** — `parameters` overrides the
  catalog defaults for turn detection, audio formats, and rates.
- **Ship only the conversation** — delete `src/ui/transcription/`,
  `src/ui/speech/`, `src/services/transcription/`, and
  `src/services/speech/` (plus their `*.test.ts` files), then
  remove the two destinations from `src/ui/home/screen.tsx`.
  Shared layers under `models/`, `networking/`, `auth/`,
  `realtime/`, and `audio/` are untouched.

## How a conversation runs

```text
REST:      https://api.wiro.ai/v1
WebSocket: wss://socket.wiro.ai/v1
Run:       POST /Run/{owner}/{model}
```

1. `POST /Run/{owner}/{model}` returns a task id and a task token.
2. A WebSocket opens and subscribes with
   `{ "type": "task_info", "tasktoken": "..." }`.
3. After `task_stream_ready`, 20 ms PCM chunks stream up as
   `UTF8(tasktoken + "|") + pcm_bytes`; audio and transcripts stream
   back.
4. `task_session_end` closes the session — sent by the app on leave,
   or by the server when the task goes quiet.

Audio is signed 16-bit PCM, 24 kHz, mono, little-endian on both
sides.

Authentication is `x-api-key` alone, or `x-api-key` + `x-nonce` +
`x-signature` where the signature is
`HMAC-SHA256(key = API_KEY, message = API_SECRET + NONCE)`.

## Project layout

```text
src/
  app/          entry config, env, theme (Wiro light/dark)
  models/       catalog, parameters, run result
  networking/   HTTP client, endpoints, Run launcher
  auth/         credentials, nonce, headers
  realtime/     socket, session, framing
  audio/        PCM constants, recorder/player queues, sink types
  services/     Conversation / Transcription / Speech — no React
  ui/           navigation + screens
    home/ conversation/ transcription/ speech/ shared/
specs/          TurboModule codegen spec (NativeWiroPcmAudio.ts)
android/        RN app + WiroPcmAudio Kotlin module
ios/            RN app + WiroPcmAudio Swift module
```

`models/`, `networking/`, `auth/`, `realtime/`, and `audio/` have
no dependency on React or any screen service and cover the whole
Wiro integration — they are the part worth lifting into your own
app. Tests mirror `src/` and live next to the code (`*.test.ts`);
fakes live in `support/` folders.

## Tests

```sh
npm run lint && npm run typecheck && npm test
```

Tests mirror `src/` and ship fakes for audio, network, and the
socket, so the entire session lifecycle runs without a device. CI
runs the same three commands on every push and pull request.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull
request; [`AGENTS.md`](AGENTS.md) is the architecture document it
points at. Security problems go to [`SECURITY.md`](SECURITY.md),
not to a public issue.

## Documentation

- [Wiro documentation](https://wiro.ai/docs)
- [Available models](https://wiro.ai/models)
- [Kotlin counterpart](https://github.com/wiroai/Kotlin-Realtime)
- [Swift counterpart](https://github.com/wiroai/Swift-Realtime)
- [Dart counterpart](https://github.com/wiro-ai/Dart-Realtime)

## License

MIT

---

<div align="center">

<img src="https://wiro.ai/images/koala/accent-heavy-koala.png" alt="Wiro" width="80" />

**Built with 💚 by the Wiro team**

[wiro.ai](https://wiro.ai) · [GitHub @wiroai](https://github.com/wiroai)

</div>
