# Contributing

Thanks for taking the time. This is a small, opinionated example
app; the bar for a change is that it keeps the example small and
opinionated.

## Before you start

- Read [`AGENTS.md`](AGENTS.md). It is the architecture document:
  the layer rules, the chrome rules, and the reasons behind the
  session lifecycle. Pull requests that contradict it will be asked
  to change.
- Open an issue first for anything that adds a screen, a
  dependency, a native module, or a new layer. Bug fixes and test
  improvements can go straight to a pull request.

## Setup

```sh
npm install
cp .env.example .env
```

The test suite does not talk to Wiro and does not read `.env`; a
key is needed only to run the app. A physical Android or iOS phone
is needed only to hear audio — the emulator and the simulator have
no usable microphone path.

For iOS, install pods once:

```sh
bundle install
cd ios && bundle exec pod install && cd ..
```

## Running the checks

```sh
npm run lint && npm run typecheck && npm test
```

CI runs the same three commands with coverage enforced
(`coverageThreshold` in `jest.config.js`). Lint is
`--max-warnings 0`: a warning fails the build.

## What a good change looks like

- Root layers (`models/`, `networking/`, `auth/`, `realtime/`,
  `audio/`) never import React, a screen, or a screen service.
  Services never touch view state. Screens never import each other;
  only Home mounts the three destinations.
- Anything that waits on time takes a clock or a timeout parameter
  and is tested with fake timers, not with a real `setTimeout` in
  the test.
- Native code stays thin. The Kotlin and Swift modules move PCM
  bytes and own the platform audio session; decisions about the
  conversation live in TypeScript where they can be tested.
- Comments explain why, never what. No comment restates the line
  below it.
- TypeScript `strict`. No `any` outside the native bridge boundary,
  and each one justified in a comment.
- 80 columns, trailing commas, Paper's own typography and spacing.
  No spacing / radius / shadow tokens for chrome.
- Tests sit next to the code they cover (`*.test.ts`). Reuse the
  fakes under each `support/` folder before writing a new one.

## Commit messages

One change per commit, imperative subject under 72 characters, and
a body that says why when the diff does not.

## Reporting a problem

Include the platform and OS version, the device, the model slug
from `src/app/conversationConfig.ts`, and the Metro console output
around the failure. A recording of what you heard is worth more
than a paragraph about it. Never paste an API key or a task token.
