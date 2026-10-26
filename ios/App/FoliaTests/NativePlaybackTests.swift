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
            let attachment = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            })
            attachment.name = orientation == .portrait ? "iPhone-portrait" : "iPhone-landscape"
            attachment.lifetime = .keepAlways
            add(attachment)
            print("[FoliaNativeTest] Safe canvas \(frame.width)x\(frame.height), insets \(window.safeAreaInsets)")
        }
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
