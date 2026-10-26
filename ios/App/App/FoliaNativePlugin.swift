import Capacitor
import Foundation

// Explicit, small native bridge; all player ownership stays in NativeAudioEngine.
@objc(FoliaNativePlugin)
public class FoliaNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FoliaNativePlugin"
    public let jsName = "FoliaNative"
    public let pluginMethods: [CAPPluginMethod] = [
        "writeAudioChunk", "load", "play", "pause", "seek", "setVolume", "setQueue", "getState", "importDocuments", "getDocument"
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let engine = NativeAudioEngine()
    private let library = NativeLibrary()

    public override func load() {
        NativeLibrary.pruneAudioCache()
        engine.onState = { [weak self] value in self?.notifyListeners("state", data: value) }
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
