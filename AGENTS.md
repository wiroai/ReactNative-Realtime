# AGENTS.md

A React Native app that holds a live voice conversation with a
model running on Wiro. Clone it, put your own prompt in one file,
ship it.

## The one file to edit

`src/app/conversationConfig.ts` holds the persona, the voice, and
the model. Turning this example into a product is editing that
file. Nothing else has to change.

The model catalog (`src/models/catalog.ts`) describes what each
Wiro model accepts. It is a schema, not a place for product
decisions — config values win over its defaults.

## Run it

```sh
cp .env.example .env
```

Set `WIRO_API_KEY` in that file, or in the process environment
when you build. Add `WIRO_API_SECRET` only for signature-based Wiro
projects. Credentials are never committed. A physical Android or
iOS phone is required: the emulator/simulator has no usable
microphone path.

Launch fails fast when the key is missing (`src/app/env.ts`).

## Native chrome

The screen is `react-native-paper` Material 3. Do not invent
bespoke chrome.

- Destinations: `@react-navigation/bottom-tabs` with `lazy: false`
  (three tabs always mounted; `isVisible` comes from
  `useIsFocused()` in `src/ui/home/screen.tsx`). Do not polyfill it
  with a custom tab bar, orb, or capsule.
- Start is a prominent `Button` inside the stage (hero on idle,
  full width under a kept transcript, "Try again" on failure).
  Speech keeps its full-width Play `Button` under the prompt.
  There is still no orb.
- A live microphone screen is a call stage: status line, a large
  elapsed clock (`formatElapsed`), and a `LevelMeter` whose
  amplitude is the polled voice-activity level (a fixed wave on
  Transcription and Speech) — never per-chunk re-render. Mute /
  interrupt / stop float in a bottom toolbar
  (`ConversationLiveToolbar`). Voice and accuracy stay app-bar
  actions.
- The idle stage is a Material empty state (`StageEmptyState` in
  `src/ui/shared/stage.tsx`): an icon on a tonal container, a
  headline, one line of support, and the Start button. Connecting
  is `StageConnectingState` plus the named step and a Cancel.
  Failure is one line inside the same pattern.
- Conversation transcripts are chat bubbles: user on the trailing
  edge in `primaryContainer`, assistant leading in a tinted
  surface.
- A permanently denied microphone also gets an alert / "Open
  settings" (`SystemSettingsOffer`, `presentMicrophoneSettingsAlert`).
  A conversation that merely ended says nothing extra.
- Connecting chrome answers a tap and nothing else. A dropped
  socket, a voice edit, or a return from background is drawn as the
  live session it is.
- Theme tokens are tint and semantic color (success / error /
  muted) with a light and a dark Wiro scheme (`src/app/theme.ts`)
  that follow the system. No dynamic color: the showcase stays on
  brand. Do not grow a spacing / radius / shadow / type-scale
  design system for chrome. Typography and spacing are Paper's own.

## Layout

```
src/
  app/            entry config, env, theme, composition root
  models/         catalog, parameters, run result
  networking/     HTTP, endpoints, Run launcher
  auth/           credentials, nonce, headers
  realtime/       socket, session, framing
  audio/          PCM, native adapters, session
  services/       screen sessions — no React
    conversation/ transcription/ speech/
  ui/
    home/ conversation/ transcription/ speech/
    shared/        stage pattern, form controls, settings offer
specs/            TurboModule codegen spec (NativeWiroPcmAudio.ts)
android/          RN app + WiroPcmAudio Kotlin module
ios/              RN app + WiroPcmAudio Swift module
```

Tests sit next to the code they cover (`*.test.ts`); each area has
a `support/` folder with fakes.

`models/`, `networking/`, `auth/`, `realtime/`, and `audio/` are
the part worth stealing. They have no dependency on React or any
screen service and cover the whole integration: signed REST Run
requests, the realtime WebSocket, binary PCM framing, bounded
capture and playback queues, echo cancellation, a noise gate, and a
guard that stops two screens from opening the microphone at once.

Package / bundle id is `ai.wiro.realtime` on both platforms.

## How a conversation runs

1. `POST /Run/{owner}/{model}` with the config values returns a
   task id and a task token (`RealtimeTaskLauncher`).
2. A WebSocket opens to `wss://socket.wiro.ai/v1` and subscribes
   with `task_info` (`RealtimeSession`).
3. Once `task_stream_ready` arrives, 20 ms PCM chunks stream up as
   `UTF8(tasktoken + "|") + pcm_bytes`; audio and transcripts
   stream back.
4. `task_session_end` closes it. Leaving and not coming back, or
   the server winding down a quiet task, both end it this way.

Wiro charges a realtime task for as long as it is up, and stops one
that has gone quiet so that it stops charging. The app takes the
same side. Leaving the screen ends the conversation, a task the
server winds down is not quietly replaced with another, and
`ConversationConfig.suspendGracePeriodMs` — zero by default — is
the dial for holding a task open for someone who might come
straight back.

A dropped socket is the one case worth fighting for, because the
speaker is still there mid-sentence. The session resubscribes to
the task it already has and only launches a new one once that is
refused, since a new task is a new assistant with no memory of
anything said so far. The fight is finite: `maxAutoRestarts` bounds
the restarts a failing backend gets, and once the budget is spent
the start action is tapped again. A session reconnecting on its
own and failing is indistinguishable from one that is listening,
so it is worth less than a tap. A restart that reaches a live
conversation refills the budget.

Nothing on the way out may wait forever, either. Ending a
conversation plays out whatever audio is already queued, but a sink
that stopped draining — a track torn down under a route change, a
task the server just ended — would never finish, and the screen
would keep showing a live conversation long after the microphone
had stopped. `PcmAudioPlayer.complete` is bounded for that reason
and gives up the tail rather than the screen.

Audio is signed 16-bit PCM, 24 kHz, mono, little-endian, on both
sides (`audioConstants.ts`). Changing the rate means changing it in
the request and in the local pipeline together, or the audio is
garbled.

## Common changes

**Give the assistant a job.** Rewrite
`ConversationConfig.PERSONA`. Keep the two sentences about language
unless you want a single-language product.

**Change the voice.** `ConversationConfig.VOICE`; the accepted
values are the `voice` field options in the catalog.

**Tune the engineering parameters.**
`ConversationConfig.parameters` — the transcription model, audio
formats and rates, turn detection. Keys are the catalog's field
ids; anything not named keeps the catalog default. The persona and
the voice have their own fields and win over entries here.

**Drop the other two screens.** This app also ships transcription
and text-to-speech tabs. Delete `src/ui/transcription/`,
`src/ui/speech/`, `src/services/transcription/`,
`src/services/speech/` and their `*.test.ts` files, then remove the
two `Tab.Screen`s from `src/ui/home/screen.tsx`. The shared layers
under `models/`, `networking/`, `auth/`, `realtime/`, and `audio/`
are untouched by this.

**Do not auto-start a session.** A session is a billed task, so it
begins when Start is tapped. Starting one when the screen mounts
bills people for reaching a screen.

**Do not let a session run off screen.** `isVisible` — from
`useIsFocused()` per tab, and from `AppLifecycleTracker`
(`src/ui/home/appLifecycle.ts`) at the app level — is what tells a
screen it was left; without it the destinations stay mounted and an
unwatched tab keeps the microphone open and the task billing.
`AppState` going to `background` (not the transient `inactive`,
which is Control Center, the app switcher, and permission dialogs
on iOS) is the same hang-up. Conversation resumes automatically on
return only if its tab is still the one on screen; Transcription
and Speech wait for an explicit tap on Start. A new screen that
hosts a session has to wire both signals.

## Conventions

- Session engines are plain classes publishing immutable snapshots
  (`services/`). Screens subscribe with the `useServiceSnapshot`
  hook (`useSyncExternalStore` under the hood). No Redux, no MobX,
  no DI framework.
- Screens are function components. Only Home mounts the three
  destinations; they stay composed and read `isVisible` from their
  route.
- The conversation is app-bar actions and stage copy, never an orb
  and never a panel per stage.
- Feature folders under `ui/` keep the screen, its copy, and its
  test fakes side by side. Session engines live under `services/`.
  Shared plumbing sits at the root (`models/`, `networking/`,
  `auth/`, `realtime/`, `audio/`). Screens do not import each
  other; only Home mounts the three destinations.
- Root layers never import React or a screen and never contain UI.
- Services never touch view state. They publish immutable
  snapshots, which is why the whole session lifecycle is testable
  without a component tree.
- Styling: Paper's Material 3 color scheme and typography via
  `useTheme()`. Do not add project spacing / radius / shadow tokens
  for chrome.
- `async`/`await` throughout. No class-based promise chains, no
  callback trees.
- TypeScript `strict: true`. No `any` outside the native bridge
  boundary, and each one justified.
- 80-column lines, trailing commas. ESLint and Prettier stay clean.
- Comments explain why, never what. No comment restates the line
  below it.

## Before committing

```sh
npm run lint && npm run typecheck && npm test
```

Tests must be clean. They sit next to the code they cover; each
area has a `support/` folder with fakes for audio, network, and the
socket, so a new test rarely needs new scaffolding.

Never write API credentials into the repository.
