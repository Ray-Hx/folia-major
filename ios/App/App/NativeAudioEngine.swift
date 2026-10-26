import AVFoundation
import MediaPlayer
import UIKit

// Owns playback independently of JavaScript, including queue advancement while WebKit is suspended.
final class NativeAudioEngine {
    let player = AVPlayer()
    var onState: (([String: Any]) -> Void)?
    private var source = ""
    private var tracks: [[String: String]] = []
    private var loop = "off"
    private var itemStatusObservation: NSKeyValueObservation?
    private var itemDurationObservation: NSKeyValueObservation?
    private var observation: NSKeyValueObservation?
    private var timeObservation: Any?
    private var tokens: [NSObjectProtocol] = []
    private var resumeAfterInterruption = false
    private var artworkTask: URLSessionDataTask?
    private var artworkURL = ""
    private var artwork: MPMediaItemArtwork?
    private var lastEvent = "state"
    private var commandTargets: [(MPRemoteCommand, Any)] = []

    init() {
        timeObservation = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] _ in
            self?.publish()
        }
        observation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.publish() }
        }
        let center = NotificationCenter.default
        tokens.append(center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in
            guard let self, note.object as? AVPlayerItem === self.player.currentItem else { return }
            if self.loop == "one" { self.seek(0); self.player.play() }
            else if !self.advance(1) { self.lastEvent = "ended"; self.publish(event: "ended") }
        })
        tokens.append(center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: nil, queue: .main) { [weak self] note in
            guard let self, note.object as? AVPlayerItem === self.player.currentItem else { return }
            self.publish(event: "error")
        })
        tokens.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
            if type == AVAudioSession.InterruptionType.began.rawValue {
                self.resumeAfterInterruption = self.player.rate > 0
                self.player.pause()
            } else {
                let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
                if self.resumeAfterInterruption && AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) {
                    try? self.play()
                }
                self.resumeAfterInterruption = false
            }
        })
        tokens.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                self?.pause()
            }
        })
        let commands = MPRemoteCommandCenter.shared()
        bind(commands.playCommand) { [weak self] _ in
            do { try self?.play(); return .success } catch { return .commandFailed }
        }
        bind(commands.pauseCommand) { [weak self] _ in self?.pause(); return .success }
        bind(commands.togglePlayPauseCommand) { [weak self] _ in
            guard let self else { return .commandFailed }
            if self.player.rate > 0 { self.pause() } else { try? self.play() }
            return .success
        }
        bind(commands.changePlaybackPositionCommand) { [weak self] event in
            guard let value = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.seek(value.positionTime); return .success
        }
        bind(commands.nextTrackCommand) { [weak self] _ in self?.advance(1) == true ? .success : .noSuchContent }
        bind(commands.previousTrackCommand) { [weak self] _ in
            guard let self else { return .commandFailed }
            if self.player.currentTime().seconds > 3 { self.seek(0); return .success }
            return self.advance(-1) ? .success : .noSuchContent
        }
    }

    private func bind(_ command: MPRemoteCommand, handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus) {
        commandTargets.append((command, command.addTarget(handler: handler)))
    }

    func load(_ url: String, nativeURL: String? = nil) throws {
        // A foreground reconciliation of an already playing background track must not restart it.
        guard source != url else { return }
        let resolved = try NativeLibrary.resolveAudioURL(nativeURL ?? url)
        source = url
        lastEvent = "state"
        let item = AVPlayerItem(url: resolved)
        // A paused/restored item may become ready without a playback-clock tick.
        let ready: () -> Void = { [weak self, weak item] in
            DispatchQueue.main.async {
                guard let self, let item, self.player.currentItem === item else { return }
                self.publish(event: item.status == .failed ? "error" : "loaded")
            }
        }
        itemStatusObservation = item.observe(\.status, options: [.new]) { _, _ in ready() }
        itemDurationObservation = item.observe(\.duration, options: [.new]) { _, _ in ready() }
        player.replaceCurrentItem(with: item)
        publish(event: "loaded")
    }

    func play() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, policy: .longFormAudio)
        try session.setActive(true)
        lastEvent = "state"
        player.play()
        publish()
    }

    func pause() { resumeAfterInterruption = false; player.pause(); publish() }
    func seek(_ seconds: Double) {
        guard seconds.isFinite else { return }
        player.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            DispatchQueue.main.async { self?.lastEvent = "state"; self?.publish(event: "seeked") }
        }
    }

    func setQueue(_ values: [[String: String]], loop: String) {
        tracks = values
        self.loop = loop
        let commands = MPRemoteCommandCenter.shared()
        commands.nextTrackCommand.isEnabled = tracks.count > 1
        commands.previousTrackCommand.isEnabled = !tracks.isEmpty
        publish()
    }

    @discardableResult private func advance(_ direction: Int) -> Bool {
        guard let index = tracks.firstIndex(where: { $0["url"] == source }), !tracks.isEmpty else { return false }
        var next = index + direction
        if next < 0 || next >= tracks.count {
            guard loop == "all" else { return false }
            next = (next + tracks.count) % tracks.count
        }
        guard let url = tracks[next]["url"] else { return false }
        do {
            if url == source { seek(0) } else { try load(url) }
            try play(); publish(event: "trackChanged"); return true
        }
        catch { publish(event: "error"); return false }
    }

    func snapshot(event: String = "state") -> [String: Any] {
        let duration = player.currentItem?.duration.seconds ?? 0
        let position = player.currentTime().seconds
        var state: [String: Any] = ["url": source, "position": position.isFinite ? position : 0,
            "duration": duration.isFinite ? duration : 0, "playing": player.rate > 0, "advancing": player.timeControlStatus == .playing,
            "event": lastEvent == "ended" ? "ended" : event]
        if let error = player.currentItem?.error { state["error"] = error.localizedDescription }
        return state
    }

    private func publish(event: String = "state") {
        updateNowPlaying()
        onState?(snapshot(event: event))
    }

    private func updateNowPlaying() {
        guard !source.isEmpty else { return }
        let metadata = tracks.first { $0["url"] == source }
        let duration = player.currentItem?.duration.seconds ?? 0
        let position = player.currentTime().seconds
        var info: [String: Any] = [MPMediaItemPropertyTitle: metadata?["title"] ?? "Folia",
            MPMediaItemPropertyArtist: metadata?["artist"] ?? "",
            MPMediaItemPropertyAlbumTitle: metadata?["album"] ?? "",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position.isFinite ? position : 0,
            MPNowPlayingInfoPropertyPlaybackRate: player.rate,
            MPMediaItemPropertyPlaybackDuration: duration.isFinite ? duration : 0]
        let requested = metadata?["artwork"] ?? ""
        if requested != artworkURL {
            artworkURL = requested; artwork = nil; artworkTask?.cancel()
            if let url = URL(string: requested), url.scheme == "https" {
                artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
                    guard let data, data.count < 10_000_000, let image = UIImage(data: data) else { return }
                    DispatchQueue.main.async {
                        guard let self, self.artworkURL == requested else { return }
                        self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                        self.updateNowPlaying()
                    }
                }
                artworkTask?.resume()
            }
        }
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    deinit {
        if let timeObservation { player.removeTimeObserver(timeObservation) }
        tokens.forEach(NotificationCenter.default.removeObserver)
        artworkTask?.cancel()
        for (command, target) in commandTargets { command.removeTarget(target) }
    }
}
