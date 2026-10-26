# iOS validation record — 2026-10-27

Priority device: iPhone 16 Pro. Minimum deployment target: iOS 17. Tests ran with Xcode 27.2 and an iOS 26.0 iPhone 16 Pro simulator. Older iOS versions have not been exercised.

## Passed

- TypeScript type check and bundled iOS production build / Capacitor resource sync.
- 97 targeted unit tests across nine files: native audio-element adaptation, queue boundaries, foreground adoption, playback source routing, direct NetEase QR/session response contracts, login host, catalogue request routing and existing grid contracts.
- Nine hosted XCTest tests, using real AVPlayer and generated PCM audio: full-display WebView plus safe content in portrait/landscape; actual playback, seek, pause and Now Playing metadata; queue advancement without JavaScript; advancement while the test host is backgrounded by launching Settings; single-repeat and end-of-queue; one-item list-repeat; path/scheme rejection; cache chunk round-trip; sandbox file fetch through the real Capacitor bridge and metadata worker.
- Native geometry: portrait WebView **402 × 874 pt**, content **402 × 778 pt**, top/bottom insets 62/34 pt. Landscape WebView **874 × 402 pt**, content **750 × 362 pt**, left/right insets 62 pt and top/bottom 20 pt. Background fills the display; safe content is measured separately. The earlier implementation inset the entire WebView and produced black bars; it has been replaced.
- WebKit touch checks passed on six sizes for home, search, settings, rotation and horizontal overflow. After the edge-to-edge change, the iPhone 16 Pro cases were repeated at 402 × 874 and 874 × 402. All 15 built-in lyric modes mounted in both orientations; the classic mode additionally asserted actual lyric text. This is a rendering/geometry check, not proof of every animation's visual quality or frame rate.
- Manual native simulator flow: system Files picker → select generated WAV → import → collection → play; playback progress advanced. Imported catalogue survived app relaunch. Mobile collection overview uses touch cards and scrolling actions. Collection return controls avoid status-bar overlap. Landscape song cards use a horizontal cover/text layout; the home overview uses compact horizontal collection cards.
- Real NetEase service: QR key obtained through native HTTP; QR rendered locally in the app; reopening generated a different QR and remained in the waiting-for-scan state. Anonymous search returned a result. No third-party relay was used, and no account was authorized by the agent.
- Release archive, development IPA export and strict/deep code-signature verification succeeded. The exact exported delivery app (0.7.22, build 3) was installed and launched on the connected physical iPhone 16 Pro after final layout verification.

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

Delivery artifact: ignored `ios/output/Folia-iPhone16Pro.ipa`, now build 4 (11,581,167 bytes). Build 3 introduced the full-display layout and direct NetEase QR transport; build 4 adds the changes below. The old `Folia.ipa` in the output directory predates these fixes.

## Follow-up: QR authorization rejected as an abnormal environment

Build 2 generated a QR but account-owner scanning was reported as blocked. A displayed QR and waiting-state response did not establish successful authorization.

The iOS QR URL omitted the web `chainId` added by the upstream's fix for the same symptom ([upstream commit](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/commit/4f4aa134d53704932b9fe0e09b7170f2a2451731)). Build 3 includes the upstream-compatible web chain ID, based on the same persistent installation/session cookie used for key creation and polling. Server-issued session cookies are retained across these requests. Account credentials remain owned by the account store and are not duplicated in the transport cookie jar.

Seven direct-transport tests now cover the chain ID, session continuity, waiting state, authenticated-cookie handling, sign-out isolation and catalogue routing. All 97 targeted regression tests and type checking passed. Successful account-owner authorization remains unverified until the new QR is scanned; this change is not a guarantee that NetEase will accept the client.

Build 3 release export passed strict/deep code-signature verification, and the exact exported app was installed and launched on the connected iPhone 16 Pro. A screenshot of the running simulator app's QR was decoded with Vision: its destination was the official HTTPS music.163.com endpoint and it contained both `codekey` and the web `chainId`. The QR/session identifiers and cookies are not included in this record or committed screenshots.

## Build 4: immersive lyrics, panel layout and clear glass

- TypeScript, production resource build/sync and simulator compilation passed.
- 126 unit tests across 11 files passed, including existing playback/source/login contracts and bottom-bar/subtitle layout.
- Nine WebKit cases passed: six display sizes, all 15 lyric renderers at 402 × 874 and 874 × 402, actual classic lyric text, full-viewport lyric bounds, control-panel dock/body separation and background-tap immersion. Tests mock the native bridge; they do not establish UIKit material behavior.
- Eleven hosted XCTest cases passed. Real UIKit tests verify the Liquid Glass effect type, transport actions/seek and visibility; actual WebView/lyric bounds fill portrait and landscape viewports. Real AVPlayer tests also verify paused-item duration publication. Existing background queue and file bridge tests remain passing.
- Manual iPhone 16 Pro simulator inspection confirms Clear Liquid Glass transport, full-display scene, separated panel components, and transparent settings with a slightly denser tint. Settings and advanced panels remain Folia React glass styling, not native UIGlassEffect.
- Evidence: [clear native player](screenshots/iphone16pro-clear-player.png), [advanced controls](screenshots/iphone16pro-clear-controls.png), [settings](screenshots/iphone16pro-clear-settings.png). The song in these native screenshots has no lyric fixture; actual lyric text is covered by WebKit rendering tests.
- iOS 17–25 material fallback is guarded by availability but has not been visually checked on those OS versions. Hardware AirPlay and sustained animation performance remain unverified. Authentication limitations above remain applicable.

Build 4 release archive/export and strict/deep signature verification passed. The exact exported app was installed and launched on the connected iPhone 16 Pro. SHA-256 of the delivery IPA: `c879815a5d0cea1f9c731ea3c7f220affbba8f2e97232a681ef816732209397a`. Development provisioning expiry remains as documented above. Physical installation/launch is verified; manual visual inspection described above was on the simulator.

## Build 5: remove desktop settings and tutorial prompts on iPhone

- Removed native-iOS navigation/search targets and actual settings rows for keyboard interaction, desktop windows/cursors, web control-bar layout, old track cards, desktop debug tools, broadcasting/capture, renderer workarounds and unsupported Web Audio processing. Existing settings values and desktop behavior are retained.
- Disabled the tutorial host, touch lightbulb, hover hints, startup sequence and loop-button tutorial notice on iOS. Help retains version/community information without tutorial tiles or keyboard cards. Settings now opens the options page by default on iPhone.
- TypeScript and production build/resource sync passed. Sixty unit tests covering settings navigation/search, startup flow and command contracts passed. Fresh-install WebKit cleanup checks passed, including removed targets being absent from the DOM and search while language, queues, frame rate and Navidrome remain available. Six viewport/rotation cases, panel separation and immersion switching passed.
- The lyric sweep initially failed while checking deferred style loading before its DOM existed; the test now waits for the selected style. A cold development startup also exceeded its timeout during concurrent native builds; the sweep allows longer startup before checking actual geometry/text. These failures are retained in local logs rather than counted as passed.
- Native simulator manual inspection confirmed the missing lightbulb, default options landing and cleaned General page. Native Swift behavior is unchanged in this build; the eleven audio/material tests documented for build 4 were not repeated.
- Build 5 archive/export passed strict/deep signature verification. Delivery IPA: 11,579,924 bytes; SHA-256 `460d5aa90a1d86192957e8ecc90efe356d951b924073fa29f4e8c077529600c1`. Development profile expiry and account-login limitations above remain applicable. The exact exported build 5 app was installed and launched on the connected iPhone 16 Pro.

Final lyric sweep passed for all 15 styles in both orientations, including settled full-screen geometry and actual classic lyric text. Together with the nine other passing cases, all ten iOS WebKit scenarios passed across the full run and focused reruns. The sweep waits for deferred loading and the incoming style animation to settle before measuring its frame; the app renderer was not changed.
