import Foundation
import UIKit
import UniformTypeIdentifiers

// Copies security-scoped imports once; stable relative identifiers survive sandbox relocation.
final class NativeLibrary: NSObject, UIDocumentPickerDelegate {
    var completion: ((Result<[[String: Any]], Error>) -> Void)?
    static var directory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Library", isDirectory: true)
    }
    static var cacheDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("FoliaAudio", isDirectory: true)
    }
    static func writeChunk(path: String, data: String, append: Bool) throws {
        guard path.hasSuffix(".audio"), UUID(uuidString: String(path.dropLast(6))) != nil,
              let bytes = Data(base64Encoded: data), bytes.count <= 256 * 1024 else { throw URLError(.badURL) }
        try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        let destination = cacheDirectory.appendingPathComponent(path)
        if !append { try bytes.write(to: destination, options: .atomic) }
        else {
            let handle = try FileHandle(forWritingTo: destination)
            defer { try? handle.close() }
            let offset = try handle.seekToEnd()
            guard offset + UInt64(bytes.count) <= 512 * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
            try handle.write(contentsOf: bytes)
        }
    }
    static func pruneAudioCache() {
        // Called once before any playback begins. Cached audio remains reproducible from IndexedDB.
        try? FileManager.default.removeItem(at: cacheDirectory)
    }
    static func file(_ path: String) throws -> URL {
        guard !path.isEmpty, path == URL(fileURLWithPath: path).lastPathComponent,
              !path.contains(".."), !path.contains("/"), !path.contains("\\") else {
            throw NSError(domain: "Folia", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid library path"])
        }
        let url = directory.appendingPathComponent(path)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw NSError(domain: "Folia", code: 2, userInfo: [NSLocalizedDescriptionKey: "Music file is missing"])
        }
        return url
    }
    static func resolveAudioURL(_ value: String) throws -> URL {
        guard let url = URL(string: value) else { throw URLError(.badURL) }
        if url.scheme == "folia-local", url.host == "library" {
            return try file(url.lastPathComponent)
        }
        if url.scheme == "folia-cache", url.host == "audio" {
            let path = url.lastPathComponent
            guard path.hasSuffix(".audio"), UUID(uuidString: String(path.dropLast(6))) != nil else { throw URLError(.badURL) }
            return cacheDirectory.appendingPathComponent(path)
        }
        guard ["https", "http"].contains(url.scheme ?? "") else { throw URLError(.unsupportedURL) }
        return url
    }
    func present(from controller: UIViewController) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.audio], asCopy: false)
        picker.allowsMultipleSelection = true
        picker.delegate = self
        controller.present(picker, animated: true)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        completion?(.success([])); completion = nil
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        // Copying iCloud or lossless files must not block the main thread or playback.
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result { () throws -> [[String: Any]] in
                try FileManager.default.createDirectory(at: Self.directory, withIntermediateDirectories: true)
                return try urls.map { url in
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let name = UUID().uuidString + "." + url.pathExtension.lowercased()
                    let destination = Self.directory.appendingPathComponent(name)
                    var coordinationError: NSError?
                    var copyError: Error?
                    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { source in
                        do { try FileManager.default.copyItem(at: source, to: destination) }
                        catch { copyError = error }
                    }
                    if let error = coordinationError ?? copyError as NSError? { throw error }
                    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
                    let size = try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    return ["path": name, "name": url.lastPathComponent, "uri": destination.absoluteString, "size": size]
                }
            }
            DispatchQueue.main.async { self.completion?(result); self.completion = nil }
        }
    }
}
