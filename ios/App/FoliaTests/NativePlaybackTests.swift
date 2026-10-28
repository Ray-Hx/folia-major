import XCTest
import AVFoundation
import MediaPlayer
import WebKit
@testable import App

// Real AVPlayer tests hosted in the simulator app, using generated PCM instead of network fixtures.
@MainActor
final class NativePlaybackTests: XCTestCase {
    private var engine: NativeAudioEngine!
    private var files: [URL] = []
    override func setUp() async throws { engine = NativeAudioEngine() }
    override func tearDown() async throws {
        engine.pause(); engine.onState = nil; engine = nil
        for file in files { try? FileManager.default.removeItem(at: file) }
        files = []
    }
    private func track(seconds: Double = 4) throws -> String {
        try FileManager.default.createDirectory(at: NativeLibrary.directory, withIntermediateDirectories: true)
        let url = NativeLibrary.directory.appendingPathComponent(UUID().uuidString + ".wav")
        let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)!
        let count = AVAudioFrameCount(16000 * seconds)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count)!
        buffer.frameLength = count
        for sample in 0..<Int(count) { buffer.floatChannelData![0][sample] = Float(sin(Double(sample) * 2 * .pi * 220 / 16000)) * 0.01 }
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try file.write(from: buffer)
        files.append(url)
        return "folia-local://library/\(url.lastPathComponent)"
    }
    private func waitFor(_ predicate: @escaping ([String: Any]) -> Bool, timeout: Double = 8) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if predicate(engine.snapshot()) { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("Native state condition timed out: \(engine.snapshot())")
    }
    func testASafeAreaInPortraitAndLandscape() async throws {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first!
        let window = scene.windows.first!
        func findWebView(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.lazy.compactMap { findWebView($0) }.first
        }
        let web = findWebView(window)!
        for orientation: UIInterfaceOrientationMask in [.portrait, .landscapeRight, .portrait] {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: orientation))
            for _ in 0..<50 {
                if scene.interfaceOrientation.isPortrait == (orientation == .portrait) { break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            try await Task.sleep(nanoseconds: 500_000_000)
            XCTAssertEqual(scene.interfaceOrientation.isPortrait, orientation == .portrait)
            let frame = web.convert(web.bounds, to: window)
            let safe = window.safeAreaLayoutGuide.layoutFrame
            XCTAssertEqual(frame.minX, 0, accuracy: 1)
            XCTAssertEqual(frame.minY, 0, accuracy: 1)
            XCTAssertEqual(frame.maxX, window.bounds.maxX, accuracy: 1)
            XCTAssertEqual(frame.maxY, window.bounds.maxY, accuracy: 1)
            XCTAssertGreaterThan(frame.width, 300)
            for _ in 0..<100 {
                if (try? await web.evaluateJavaScript("!!document.querySelector('.ios-safe-content')")) as? Bool == true { break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            let content = try await web.evaluateJavaScript("(() => { const r = document.querySelector('.ios-safe-content').getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })()") as! [Double]
            XCTAssertEqual(content[0], safe.minX, accuracy: 1)
            XCTAssertEqual(content[1], safe.minY, accuracy: 1)
            XCTAssertEqual(content[2], safe.width, accuracy: 1)
            XCTAssertEqual(content[3], safe.height, accuracy: 1)
            for _ in 0..<100 {
                if (try? await web.evaluateJavaScript("!!document.querySelector('[data-visualizer-style]')")) as? Bool == true { break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            let lyricFrame = try await web.evaluateJavaScript("(() => { const r = document.querySelector('[data-visualizer-style]').getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })()") as! [Double]
            XCTAssertEqual(lyricFrame[0], 0, accuracy: 1)
            XCTAssertEqual(lyricFrame[1], 0, accuracy: 1)
            XCTAssertEqual(lyricFrame[2], window.bounds.width, accuracy: 1)
            XCTAssertEqual(lyricFrame[3], window.bounds.height, accuracy: 1)
            // Exercise the iOS library canvas CSS inside the real safe-area parent. The browser
            // suite separately mounts the actual Bravais stage and its camera/controls.
            // The wall and posters paint the complete display; the info strip, its lists, the seam
            // tab and the poster UI stay inside the safe rectangle.
            let libraryFrame = try await web.evaluateJavaScript("""
                (() => {
                    const host = document.querySelector('.ios-safe-content');
                    const wall = document.createElement('section'); wall.className = 'bravais-root';
                    const seam = document.createElement('div'); seam.className = 'bravais-seam';
                    seam.style.cssText = 'position:absolute;inset:0';
                    const content = document.createElement('div'); content.className = 'bravais-seam-content';
                    content.style.position = 'absolute'; seam.append(content);
                    const tab = document.createElement('button'); tab.className = 'bravais-seam-tab';
                    tab.dataset.side = 'left';
                    wall.append(seam, tab); host.append(wall);
                    const r = wall.getBoundingClientRect(), c = content.getBoundingClientRect();
                    const tabLeft = parseFloat(getComputedStyle(tab).left);
                    const posterSeam = document.createElement('div'); posterSeam.className = 'bravais-seam';
                    posterSeam.dataset.bravaisSeam = 'poster';
                    // The wall's lazy chunk owns the real bleed rules; this stand-in keeps the same
                    // 40vh offsets so the always-loaded iOS rules can be checked without that chunk.
                    posterSeam.style.cssText = 'position:absolute;left:0;right:0;top:calc(-1 * 40vh);bottom:calc(-1 * 40vh)';
                    const posterContent = document.createElement('div'); posterContent.className = 'bravais-seam-content';
                    posterContent.style.cssText = 'position:absolute;left:0;right:0;top:40vh;bottom:40vh';
                    const posterUi = document.createElement('div'); posterUi.className = 'bravais-poster-ui';
                    posterContent.append(posterUi); posterSeam.append(posterContent); wall.append(posterSeam);
                    const p = posterContent.getBoundingClientRect();
                    const ui = getComputedStyle(posterUi);
                    const result = [r.x, r.y, r.width, r.height, c.y, c.height, tabLeft,
                        p.y, p.height, parseFloat(ui.paddingTop), parseFloat(ui.paddingBottom)];
                    wall.remove(); return result;
                })()
                """) as! [Double]
            XCTAssertEqual(libraryFrame[0], 0, accuracy: 1)
            XCTAssertEqual(libraryFrame[1], 0, accuracy: 1)
            XCTAssertEqual(libraryFrame[2], window.bounds.width, accuracy: 1)
            XCTAssertEqual(libraryFrame[3], window.bounds.height, accuracy: 1)
            XCTAssertEqual(libraryFrame[4], safe.minY, accuracy: 1)
            XCTAssertEqual(libraryFrame[5], safe.height, accuracy: 1)
            XCTAssertEqual(libraryFrame[6], safe.minX, accuracy: 1)
            // A poster keeps its bleed: it still starts at the display edge, not the safe inset.
            XCTAssertEqual(libraryFrame[7], 0, accuracy: 1)
            XCTAssertEqual(libraryFrame[8], window.bounds.height, accuracy: 1)
            XCTAssertEqual(libraryFrame[9], safe.minY, accuracy: 1)
            XCTAssertEqual(libraryFrame[10], window.safeAreaInsets.bottom, accuracy: 1)
            let attachment = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            })
            attachment.name = orientation == .portrait ? "iPhone-portrait" : "iPhone-landscape"
            attachment.lifetime = .keepAlways
            add(attachment)
            print("[FoliaNativeTest] Safe canvas \(frame.width)x\(frame.height), insets \(window.safeAreaInsets)")
        }

        // The real library wall: Bravais paints the complete display while its info strip, lists and
        // buttons stay inside the safe rectangle.
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        _ = try await web.evaluateJavaScript("""
            (() => {
                localStorage.setItem('library_suite', 'bravais');
                localStorage.setItem('library_suite_prompt_seen', 'true');
                localStorage.setItem('folia_last_seen_ponder_onboarding_version', '\(version)');
                location.reload();
            })()
            """)
        let libraryFrames = try await waitForBravaisWall(web)
        XCTAssertEqual(libraryFrames.count, 4)
        guard libraryFrames.count == 4 else { return }
        try await waitForBravaisSeam(web)
        XCTAssertEqual(libraryFrames[0], 0, accuracy: 1)
        XCTAssertEqual(libraryFrames[1], 0, accuracy: 1)
        XCTAssertEqual(libraryFrames[2], Double(window.bounds.width), accuracy: 1)
        XCTAssertEqual(libraryFrames[3], Double(window.bounds.height), accuracy: 1)
        let safe = window.safeAreaLayoutGuide.layoutFrame
        let toolsFrame = try await waitForWallTools(web)
        XCTAssertEqual(toolsFrame.count, 4)
        if toolsFrame.count == 4 {
            XCTAssertGreaterThanOrEqual(toolsFrame[0], Double(safe.minX) - 1)
            XCTAssertGreaterThanOrEqual(toolsFrame[1], Double(safe.minY) - 1)
            XCTAssertLessThanOrEqual(toolsFrame[0] + toolsFrame[2], Double(safe.maxX) + 1)
            XCTAssertLessThanOrEqual(toolsFrame[1] + toolsFrame[3], Double(safe.maxY) + 1)
        }
        attachScreenshot(window, name: "Bravais-library-portrait")

        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight))
        for _ in 0..<50 {
            if !scene.interfaceOrientation.isPortrait { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        try await Task.sleep(nanoseconds: 700_000_000)
        let landscapeWall = try await waitForBravaisWall(web)
        XCTAssertEqual(landscapeWall.count, 4)
        try await waitForBravaisSeam(web)
        if landscapeWall.count == 4 {
            XCTAssertEqual(landscapeWall[0], 0, accuracy: 1)
            XCTAssertEqual(landscapeWall[1], 0, accuracy: 1)
            XCTAssertEqual(landscapeWall[2], Double(window.bounds.width), accuracy: 1)
            XCTAssertEqual(landscapeWall[3], Double(window.bounds.height), accuracy: 1)
        }
        let landscapeTools = try await waitForWallTools(web)
        let landscapeSafe = window.safeAreaLayoutGuide.layoutFrame
        XCTAssertEqual(landscapeTools.count, 4)
        if landscapeTools.count == 4 {
            XCTAssertGreaterThanOrEqual(landscapeTools[0], Double(landscapeSafe.minX) - 1)
            XCTAssertGreaterThanOrEqual(landscapeTools[1], Double(landscapeSafe.minY) - 1)
            XCTAssertLessThanOrEqual(landscapeTools[0] + landscapeTools[2], Double(landscapeSafe.maxX) + 1)
            XCTAssertLessThanOrEqual(landscapeTools[1] + landscapeTools[3], Double(landscapeSafe.maxY) + 1)
        }
        attachScreenshot(window, name: "Bravais-library-landscape")
        print("[FoliaNativeTest] Bravais wall \(libraryFrames), tools \(toolsFrame), landscape \(landscapeWall)")
    }

    /// Waits for the lazily loaded Bravais stage and returns its viewport rect.
    private func waitForBravaisWall(_ web: WKWebView) async throws -> [Double] {
        for _ in 0..<150 {
            let frame = (try? await web.evaluateJavaScript("""
                (() => {
                    const wall = document.querySelector('[data-library-stage="bravais"]');
                    if (!wall) return null;
                    const r = wall.getBoundingClientRect();
                    return [r.x, r.y, r.width, r.height];
                })()
                """)) as? [Double] ?? []
            if frame.count == 4, frame[2] > 0 { return frame }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        return []
    }

    /// The home info strip, once it has opened (it may still be fading in right after the stage mounts).
    private func waitForBravaisSeam(_ web: WKWebView) async throws {
        for _ in 0..<50 {
            let open = (try? await web.evaluateJavaScript("""
                (() => {
                    const seam = document.querySelector('.bravais-seam');
                    if (!seam) return false;
                    const r = seam.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                })()
                """)) as? Bool ?? false
            if open {
                try await Task.sleep(nanoseconds: 500_000_000)
                return
            }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
    }

    /// The dock's tools button, once the wall has claimed it.
    private func waitForWallTools(_ web: WKWebView) async throws -> [Double] {
        for _ in 0..<50 {
            let frame = (try? await web.evaluateJavaScript("""
                (() => {
                    const tools = document.querySelector('[data-wall-tools-dock] .lattice-tools');
                    if (!tools) return null;
                    const r = tools.getBoundingClientRect();
                    return [r.x, r.y, r.width, r.height];
                })()
                """)) as? [Double] ?? []
            if frame.count == 4, frame[2] > 0 { return frame }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        return []
    }

    private func attachScreenshot(_ window: UIWindow, name: String) {
        let attachment = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        })
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testNativeGlassTransportControlsAndLayout() async throws {
        let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first!
        let chrome = NativePlayerChrome()
        chrome.attach(to: window)
        defer { chrome.removeFromSuperview() }
        chrome.present(["shown":true, "light":false, "labels":["play":"Play", "pause":"Pause", "seek":"Position"]])
        chrome.update(["duration":10.0, "position":2.0, "playing":false])
        window.layoutIfNeeded()
        XCTAssertFalse(chrome.isHidden)
        XCTAssertGreaterThan(chrome.bounds.width, 300)
        XCTAssertLessThanOrEqual(chrome.frame.maxY, window.safeAreaLayoutGuide.layoutFrame.maxY)
        if #available(iOS 26.0, *) {
            let glass = try XCTUnwrap(chrome.effect as? UIGlassEffect)
            XCTAssertTrue(glass.isInteractive)
            XCTAssertNil(glass.tintColor)
            XCTAssertEqual(chrome.cornerConfiguration, .capsule(maximumRadius: 28))
        }
        else { XCTAssertTrue(chrome.effect is UIBlurEffect) }
        func descendants(_ view: UIView) -> [UIView] { view.subviews.flatMap { [$0] + descendants($0) } }
        let children = descendants(chrome)
        let play = children.first { $0.accessibilityIdentifier == "folia-native-toggle" } as! UIButton
        XCTAssertEqual(play.tintColor, .label)
        XCTAssertEqual(play.accessibilityLabel, "Play")
        var action = ""
        chrome.onAction = { action = $0 }
        play.sendActions(for: .touchUpInside)
        XCTAssertEqual(action, "toggle")
        let slider = children.compactMap { $0 as? UISlider }.first!
        var position = 0.0
        chrome.onSeek = { position = $0 }
        slider.value = 0.5
        slider.sendActions(for: .valueChanged)
        XCTAssertEqual(position, 5, accuracy: 0.01)
        chrome.update(["duration":10.0, "position":5.0, "playing":true])
        XCTAssertEqual(play.accessibilityLabel, "Pause")
        chrome.present(["shown":false])
        XCTAssertTrue(chrome.isHidden)
    }

    func testNativeLyricHDRLayerUsesExtendedColorsAndStopsAtSDR() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Native lyric HDR needs iOS 26") }
        let view = LyricHDRView(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        XCTAssertFalse(view.isUserInteractionEnabled)
        let region: [String: Double] = ["x": 80, "y": 200, "width": 120, "height": 40]
        view.update(regions: [region], availableHeadroom: 2)
        guard !ProcessInfo.processInfo.isLowPowerModeEnabled else { throw XCTSkip("Low Power Mode suppresses HDR") }
        let glow = try XCTUnwrap(view.layer.sublayers?.first as? CAGradientLayer)
        XCTAssertEqual(glow.preferredDynamicRange, .high)
        let colors = try XCTUnwrap(glow.colors as? [CGColor])
        XCTAssertGreaterThan(UIColor(cgColor: try XCTUnwrap(colors.first)).linearExposure, 1)
        XCTAssertFalse(glow.isHidden)
        view.update(regions: [region], availableHeadroom: 1)
        XCTAssertTrue(view.isHidden)
    }

    func testPausedItemPublishesReadyDuration() async throws {
        let url = try track(seconds: 6)
        var publishedDuration = 0.0
        engine.onState = { publishedDuration = $0["duration"] as? Double ?? 0 }
        try engine.load(url)
        try await waitFor { _ in publishedDuration > 5 }
        XCTAssertFalse(engine.snapshot()["playing"] as! Bool)
    }

    func testRealPlaybackSeekPauseAndMetadata() async throws {
        let url = try track(seconds: 10)
        engine.setQueue([["url": url, "title": "Native fixture", "artist": "Folia test", "album": "Offline"]], loop: "off")
        try engine.load(url); try engine.play()
        try await waitFor { ($0["position"] as? Double ?? 0) > 0.3 }
        XCTAssertEqual(AVAudioSession.sharedInstance().category, .playback)
        XCTAssertEqual(MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String, "Native fixture")
        engine.seek(5)
        try await waitFor { ($0["position"] as? Double ?? 0) >= 5 }
        engine.pause()
        let position = engine.snapshot()["position"] as! Double
        try await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertFalse(engine.snapshot()["playing"] as! Bool)
        XCTAssertEqual(engine.snapshot()["position"] as! Double, position, accuracy: 0.1)
        // Foreground adoption of the same source preserves the actual native position.
        try engine.load(url)
        XCTAssertEqual(engine.snapshot()["position"] as! Double, position, accuracy: 0.1)
    }
    func testNativeQueueAdvancesWithoutAnyJavaScript() async throws {
        let first = try track(seconds: 1)
        let second = try track(seconds: 6)
        engine.setQueue([["url": first, "title": "One"], ["url": second, "title": "Two"]], loop: "off")
        try engine.load(first); try engine.play()
        try await waitFor { $0["url"] as? String == second && ($0["position"] as? Double ?? 0) > 0.2 }
        XCTAssertTrue(engine.snapshot()["playing"] as! Bool)
        XCTAssertEqual(MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String, "Two")
    }
    func testSingleLoopAndEndOfQueue() async throws {
        let url = try track(seconds: 1)
        engine.setQueue([["url": url]], loop: "one")
        try engine.load(url); try engine.play()
        try await Task.sleep(nanoseconds: 2_500_000_000)
        XCTAssertTrue(engine.snapshot()["playing"] as! Bool)
        XCTAssertNotEqual(engine.snapshot()["event"] as? String, "ended")
        engine.setQueue([["url": url]], loop: "off")
        try await waitFor { $0["event"] as? String == "ended" }
    }
    func testListRepeatWithOneTrackRestarts() async throws {
        let url = try track(seconds: 1)
        engine.setQueue([["url": url]], loop: "all")
        try engine.load(url); try engine.play()
        try await Task.sleep(nanoseconds: 2_500_000_000)
        XCTAssertTrue(engine.snapshot()["playing"] as! Bool)
        XCTAssertLessThan(engine.snapshot()["position"] as! Double, 1)
    }

    func testLibraryRejectsTraversalAndUnsupportedSchemes() throws {
        XCTAssertThrowsError(try NativeLibrary.file("../private"))
        XCTAssertThrowsError(try NativeLibrary.resolveAudioURL("file:///etc/passwd"))
        XCTAssertThrowsError(try NativeLibrary.resolveAudioURL("javascript:alert(1)"))
        XCTAssertThrowsError(try NativeLibrary.resolveAudioURL("folia-cache://audio/not-a-uuid.audio"))
        let track = try track()
        XCTAssertTrue(FileManager.default.fileExists(atPath: try NativeLibrary.resolveAudioURL(track).path))
    }
    func testNativeCacheChunkRoundTrip() throws {
        let path = UUID().uuidString + ".audio"
        try NativeLibrary.writeChunk(path: path, data: Data([1, 2, 3]).base64EncodedString(), append: false)
        try NativeLibrary.writeChunk(path: path, data: Data([4, 5]).base64EncodedString(), append: true)
        let url = try NativeLibrary.resolveAudioURL("folia-cache://audio/\(path)")
        files.append(url)
        XCTAssertEqual(try Data(contentsOf: url), Data([1, 2, 3, 4, 5]))
        XCTAssertThrowsError(try NativeLibrary.writeChunk(path: "../outside.audio", data: "AA==", append: false))
    }
    func testLiveQqLoginStarts() async throws {
        guard ProcessInfo.processInfo.environment["FOLIA_LIVE_QQ"] == "1" else { throw XCTSkip("Live QQ login probe is opt-in") }
        func findWebView(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.lazy.compactMap { findWebView($0) }.first
        }
        let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first!
        let web = findWebView(window)!
        for _ in 0..<100 {
            if (try? await web.evaluateJavaScript("typeof window.Capacitor?.nativePromise === 'function'")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let assets = Bundle.main.url(forResource: "public", withExtension: nil)!.appendingPathComponent("assets")
        let module = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: assets, includingPropertiesForKeys: nil)
            .first { $0.lastPathComponent.hasPrefix("iosQq-") && $0.pathExtension == "js" })
        let result = try await web.callAsyncJavaScript("""
            const api = await import('/assets/' + moduleName);
            const channels = await (await api.requestIOSQq('/login/channels', {})).json();
            const key = await (await api.requestIOSQq('/login/qr/key?channel=' + channel, {})).json();
            if (!key.data?.unikey) return { channels: channels.data?.channels, code: key.code, message: key.message };
            const image = await (await api.requestIOSQq('/login/qr/create?key=' + encodeURIComponent(key.data.unikey), {})).json();
            const check = await (await api.requestIOSQq('/login/qr/check?key=' + encodeURIComponent(key.data.unikey), {})).json();
            return { channels: channels.data?.channels, image: Boolean(image.data?.qrimg), code: image.code, check: check.code, message: image.message };
            """, arguments: ["moduleName": module.lastPathComponent, "channel": ProcessInfo.processInfo.environment["FOLIA_QQ_CHANNEL"] ?? "qq"], in: nil, contentWorld: .page) as! [String: Any]
        XCTAssertEqual(result["image"] as? Bool, true, "QQ QR probe failed: \(result)")
        XCTAssertEqual(result["check"] as? Int, 801, "QQ QR polling failed: \(result)")
    }
    func testWebKitQqCookieHeaders() async throws {
        func findWebView(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.lazy.compactMap { findWebView($0) }.first
        }
        let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first!
        let web = findWebView(window)!
        for _ in 0..<100 {
            if (try? await web.evaluateJavaScript("typeof window.Capacitor?.nativePromise === 'function'")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let result = try await web.evaluateJavaScript("new Headers({cookie:'a=b'}).get('cookie')") as? String
        XCTAssertEqual(result, "a=b")
    }
    func testWebKitBridgeReadsSandboxFileAndParsesMetadata() async throws {
        let source = try track(seconds: 2)
        let path = URL(string: source)!.lastPathComponent
        func findWebView(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.lazy.compactMap { findWebView($0) }.first
        }
        let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first!
        let web = findWebView(window)!
        for _ in 0..<100 {
            if (try? await web.evaluateJavaScript("typeof window.Capacitor?.nativePromise === 'function'")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let assets = Bundle.main.url(forResource: "public", withExtension: nil)!.appendingPathComponent("assets")
        let worker = try FileManager.default.contentsOfDirectory(at: assets, includingPropertiesForKeys: nil).first { $0.lastPathComponent.hasPrefix("metadataParser.worker-") && $0.pathExtension == "js" }!
        let result = try await web.callAsyncJavaScript("""
            const file = await window.Capacitor.nativePromise('FoliaNative', 'getDocument', {path});
            const response = await fetch(window.Capacitor.convertFileSrc(file.uri));
            if (!response.ok && response.status !== 0) throw new Error('Native file HTTP ' + response.status);
            const blob = await response.blob();
            const parser = new Worker('/assets/' + workerName, {type:'module'});
            const metadata = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Metadata worker timed out')), 10000);
                parser.onmessage = event => { clearTimeout(timer); resolve(event.data); };
                parser.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
                parser.postMessage({type:'parse-metadata', file: new File([blob], 'Fixture.wav'), includeCover:true, requestId:'native-test'});
            });
            parser.terminate();
            return {size:blob.size, metadata};
            """, arguments: ["path":path, "workerName":worker.lastPathComponent], in: nil, contentWorld: .page) as! [String: Any]
        XCTAssertGreaterThan(result["size"] as? Int ?? 0, 1000)
        let metadata = result["metadata"] as! [String: Any]
        XCTAssertEqual(metadata["type"] as? String, "result")
        XCTAssertGreaterThan((metadata["data"] as? [String: Any])?["duration"] as? Double ?? 0, 1000)
    }

    func testBackgroundQueue() async throws {
        guard ProcessInfo.processInfo.environment["FOLIA_TEST_BACKGROUND"] == "1" else { throw XCTSkip("Run dev/ios/testNative.mjs for the background scenario") }
        // The runner script backgrounds the host after this marker. The queue is entirely native.
        let first = try track(seconds: 6)
        let second = try track(seconds: 20)
        engine.setQueue([["url":first], ["url":second]], loop: "off")
        try engine.load(first); try engine.play()
        try await waitFor { ($0["position"] as? Double ?? 0) > 0.3 }
        print("[FoliaNativeTest] BACKGROUND_READY")
        try await waitFor({ _ in UIApplication.shared.applicationState == .background }, timeout: 20)
        try await waitFor({ $0["url"] as? String == second && ($0["position"] as? Double ?? 0) > 0.5 }, timeout: 15)
        XCTAssertEqual(UIApplication.shared.applicationState, .background)
        XCTAssertTrue(engine.snapshot()["playing"] as! Bool)
    }

}
