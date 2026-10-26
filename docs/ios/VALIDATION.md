# iOS validation record — 2026-10-27

Priority device: iPhone 16 Pro. Minimum deployment target: iOS 17. Tests ran with Xcode 27.2 and an iOS 26.0 iPhone 16 Pro simulator. Older iOS versions have not been exercised.

## Passed

- TypeScript type check and bundled iOS production build / Capacitor resource sync.
- 95 targeted unit tests across nine files: native audio-element adaptation, queue boundaries, foreground adoption, playback source routing, direct NetEase QR/session response contracts, login host, catalogue request routing and existing grid contracts.
- Nine hosted XCTest tests, using real AVPlayer and generated PCM audio: full-display WebView plus safe content in portrait/landscape; actual playback, seek, pause and Now Playing metadata; queue advancement without JavaScript; advancement while the test host is backgrounded by launching Settings; single-repeat and end-of-queue; one-item list-repeat; path/scheme rejection; cache chunk round-trip; sandbox file fetch through the real Capacitor bridge and metadata worker.
- Native geometry: portrait WebView **402 × 874 pt**, content **402 × 778 pt**, top/bottom insets 62/34 pt. Landscape WebView **874 × 402 pt**, content **750 × 362 pt**, left/right insets 62 pt and top/bottom 20 pt. Background fills the display; safe content is measured separately. The earlier implementation inset the entire WebView and produced black bars; it has been replaced.
- WebKit touch checks passed on six sizes for home, search, settings, rotation and horizontal overflow. After the edge-to-edge change, the iPhone 16 Pro cases were repeated at 402 × 874 and 874 × 402. All 15 built-in lyric modes mounted in both orientations; the classic mode additionally asserted actual lyric text. This is a rendering/geometry check, not proof of every animation's visual quality or frame rate.
- Manual native simulator flow: system Files picker → select generated WAV → import → collection → play; playback progress advanced. Imported catalogue survived app relaunch. Mobile collection overview uses touch cards and scrolling actions. Collection return controls avoid status-bar overlap. Landscape song cards use a horizontal cover/text layout; the home overview uses compact horizontal collection cards.
- Real NetEase service: QR key obtained through native HTTP; QR rendered locally in the app; reopening generated a different QR and remained in the waiting-for-scan state. Anonymous search returned a result. No third-party relay was used, and no account was authorized by the agent.
- Release archive, development IPA export and strict/deep code-signature verification succeeded. The exact exported delivery app (0.7.22, build 2) was installed and launched on the connected physical iPhone 16 Pro after final layout verification.

## Reproduction

```sh
npm run typecheck
npm run test:unit -- test/unit/ios test/unit/playback/songAudioSource.test.ts test/unit/gridView/gridCardLayout.test.ts test/unit/gridView/grid3DSlider.test.ts test/unit/login/loginHostState.test.ts test/unit/onlineMusic/neteaseRaw.test.ts
npm run test:ios
npm run build:ios
FOLIA_SIMULATOR_ID=YOUR_SIMULATOR_UUID npm run test:ios:native
```

The native runner's full log is in ignored `ios/output/native-tests.log`. XCTest result bundles include portrait/landscape screenshots. Browser screenshots in `test-results/ios` are transient.

## Boundaries and remaining checks

- Account-owner scan/approval and account data after successful authorization remain to be checked. QR generation is not claimed as a completed account login. QQ/Kugou require configured backends; their sign-in has not been validated.
- Physical lock-screen command execution, phone-call interruptions, Bluetooth/AirPlay, iCloud downloads, large libraries and sustained battery/thermal performance still need device testing. Native command handlers and metadata are implemented, but simulator playback tests do not prove these hardware scenarios.
- No universal 60 fps or complete online-provider compatibility claim. See [README.md](README.md) and [中文说明](README.zh-CN.md) for unsupported desktop capabilities and the next implementation steps.
- The exported IPA uses a development profile for the registered iPhone. The current profile expires **2026-11-02 17:58:57 Asia/Shanghai**; other devices require their own provisioning. Signing material and installation identifiers are not committed.

## Native layout evidence

- [Portrait home](screenshots/iphone16pro-home-portrait.png)
- [Landscape home](screenshots/iphone16pro-home-landscape.png)
- [Landscape collection](screenshots/iphone16pro-collection-landscape.png)

Delivery artifact: ignored `ios/output/Folia-iPhone16Pro.ipa`, 11,565,189 bytes. Build 2 uses the full-display layout and direct NetEase QR transport. The old `Folia.ipa` in the output directory predates these fixes.
