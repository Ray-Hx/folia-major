import Capacitor
import Foundation

// Explicit, small native bridge; all player ownership stays in NativeAudioEngine.
@objc(FoliaNativePlugin)
public class FoliaNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FoliaNativePlugin"
    public let jsName = "FoliaNative"
    public let pluginMethods: [CAPPluginMethod] = [
        "setChrome", "setLyricHDR", "lyricHDRCapabilities", "writeAudioChunk", "load", "play", "pause", "seek", "setVolume", "setQueue", "getState", "importDocuments", "getDocument", "neteaseWebLogin"
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let engine = NativeAudioEngine()
    private let library = NativeLibrary()
    private var chrome: NativePlayerChrome?
    private var lyricHDR: LyricHDRView?

    public override func load() {
        NativeLibrary.pruneAudioCache()
        engine.onState = { [weak self] value in
            self?.notifyListeners("state", data: value)
            if Thread.isMainThread { self?.chrome?.update(value) }
            else { DispatchQueue.main.async { [weak self] in self?.chrome?.update(value) } }
        }
    }
    @objc func setChrome(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let controller = self.bridge?.viewController else { call.reject("No native host"); return }
            if self.chrome == nil {
                let chrome = NativePlayerChrome()
                chrome.attach(to: controller.parent?.view ?? controller.view)
                chrome.onSeek = { [weak self] position in self?.engine.seek(position) }
                chrome.onAction = { [weak self] action in
                    guard let self else { return }
                    if action == "toggle" {
                        if self.engine.snapshot()["playing"] as? Bool == true { self.engine.pause() }
                        else { try? self.engine.play() }
                    } else { self.notifyListeners("chromeAction", data: ["action": action]) }
                }
                self.chrome = chrome
            }
            self.chrome?.present(["shown": call.getBool("shown") ?? false, "light": call.getBool("light") ?? false, "labels": call.getObject("labels") ?? [:]])
            self.chrome?.update(self.engine.snapshot())
            call.resolve()
        }
    }
    @objc func setLyricHDR(_ call: CAPPluginCall) {
        let regions = call.getArray("regions", [String: Double].self) ?? []
        DispatchQueue.main.async { [weak self] in
            guard let self, let controller = self.bridge?.viewController else { call.reject("No native host"); return }
            guard #available(iOS 26.0, *) else { call.resolve(); return }
            if self.lyricHDR == nil && !regions.isEmpty {
                let host = controller.parent?.view ?? controller.view!
                let effect = LyricHDRView(frame: host.bounds)
                effect.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                if controller.view.superview === host { host.insertSubview(effect, aboveSubview: controller.view) }
                else { host.addSubview(effect) }
                self.lyricHDR = effect
            }
            self.lyricHDR?.update(regions: regions)
            call.resolve()
        }
    }
    @objc func lyricHDRCapabilities(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard #available(iOS 26.0, *), let screen = self?.bridge?.viewController?.view.window?.windowScene?.screen else {
                call.resolve(["supported": false]); return
            }
            call.resolve(["supported": screen.potentialEDRHeadroom > 1.05])
        }
    }
    private func onMain(_ call: CAPPluginCall, _ action: @escaping () throws -> Void) {
        DispatchQueue.main.async {
            do { try action(); call.resolve() }
            catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func load(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { try self.engine.load(call.getString("url") ?? "", nativeURL: call.getString("nativeURL")); call.resolve(self.engine.snapshot()) }
            catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func writeAudioChunk(_ call: CAPPluginCall) {
        do {
            try NativeLibrary.writeChunk(path: call.getString("path") ?? "", data: call.getString("data") ?? "", append: call.getBool("append") ?? false)
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    }
    @objc func play(_ call: CAPPluginCall) { onMain(call) { try self.engine.play() } }
    @objc func pause(_ call: CAPPluginCall) { onMain(call) { self.engine.pause() } }
    @objc func seek(_ call: CAPPluginCall) { onMain(call) { self.engine.seek(call.getDouble("position") ?? 0) } }
    @objc func setVolume(_ call: CAPPluginCall) { onMain(call) { self.engine.player.volume = Float(min(1, max(0, call.getDouble("volume") ?? 1))) } }
    @objc func setQueue(_ call: CAPPluginCall) {
        onMain(call) {
            self.engine.setQueue(call.getArray("tracks", [String: String].self) ?? [], loop: call.getString("loop") ?? "off")
        }
    }
    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.engine.snapshot()) }
    }
    @objc func getDocument(_ call: CAPPluginCall) {
        do { call.resolve(["uri": try NativeLibrary.file(call.getString("path") ?? "").absoluteString]) }
        catch { call.reject(error.localizedDescription) }
    }
    @objc func neteaseWebLogin(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else {
                call.reject("No native host")
                return
            }
            let login = NeteaseWebLoginController()
            login.onFinish = { cookie in
                if let cookie, !cookie.isEmpty {
                    call.resolve(["cookie": cookie])
                } else {
                    call.resolve(["cancelled": true])
                }
            }
            let navigation = UINavigationController(rootViewController: login)
            navigation.modalPresentationStyle = .fullScreen
            controller.present(navigation, animated: true)
        }
    }

    @objc func importDocuments(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.library.completion == nil, let controller = self.bridge?.viewController else {
                call.reject("A document picker is already open"); return
            }
            self.library.completion = { result in
                switch result {
                case .success(let files): call.resolve(["files": files])
                case .failure(let error): call.reject(error.localizedDescription)
                }
            }
            self.library.present(from: controller)
        }
    }
}
