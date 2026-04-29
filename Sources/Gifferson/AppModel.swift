import AppKit
import Combine
import GiffersonCore
import Foundation
import UniformTypeIdentifiers

struct FrameItem: Identifiable, Equatable {
    let id: UUID
    let name: String
    let sourceURL: URL?
    let cgImage: CGImage
    let previewImage: NSImage
    var durationOverride: TimeInterval?

    init(
        id: UUID = UUID(),
        name: String,
        sourceURL: URL?,
        cgImage: CGImage,
        durationOverride: TimeInterval?
    ) {
        self.id = id
        self.name = name
        self.sourceURL = sourceURL
        self.cgImage = cgImage
        self.previewImage = NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
        self.durationOverride = durationOverride
    }

    static func == (lhs: FrameItem, rhs: FrameItem) -> Bool {
        lhs.id == rhs.id
    }

    func duration(default defaultDuration: TimeInterval) -> TimeInterval {
        durationOverride ?? defaultDuration
    }
}

@MainActor
final class GIFDocumentModel: ObservableObject {
    @Published var frames: [FrameItem] = []
    @Published var selectedFrameID: FrameItem.ID?
    @Published var defaultDuration: TimeInterval = 0.5
    @Published var loopMode: GIFLoopMode = .infinite
    @Published var width: Int = 1_920
    @Published var height: Int = 1_080
    @Published var lockAspectRatio = true
    @Published var fitMethod: FitMethod = .fill
    @Published var exportEngine: GIFExportEngine = .apple
    @Published var quality: GIFQuality = .best
    @Published var isPlaying = false
    @Published var draggingFrameID: FrameItem.ID?
    @Published var errorMessage: String?

    private var lockedAspectRatio: Double = 16.0 / 9.0
    private var lastAdvanceDate = Date()

    var selectedFrame: FrameItem? {
        if let selectedFrameID, let frame = frames.first(where: { $0.id == selectedFrameID }) {
            return frame
        }

        return frames.first
    }

    func frame(id: FrameItem.ID) -> FrameItem? {
        frames.first { $0.id == id }
    }

    var selectedIndex: Int? {
        guard let selectedFrame else { return nil }
        return frames.firstIndex(of: selectedFrame)
    }

    var totalDuration: TimeInterval {
        frames.reduce(0) { $0 + $1.duration(default: defaultDuration) }
    }

    var aspectRatio: Double {
        Double(width) / Double(max(1, height))
    }

    func addFiles(_ urls: [URL]) throws {
        let hadNoFrames = frames.isEmpty
        var imported: [FrameItem] = []

        for url in urls {
            let sourceFrames = try GIFEncoder.loadFrames(from: url, defaultDuration: defaultDuration)
            let isAnimatedImport = sourceFrames.count > 1
            let baseName = url.deletingPathExtension().lastPathComponent

            for (index, frame) in sourceFrames.enumerated() {
                let name = isAnimatedImport ? "\(baseName) \(index + 1)" : baseName
                let override = isAnimatedImport ? frame.duration : nil
                imported.append(FrameItem(
                    name: name,
                    sourceURL: url,
                    cgImage: frame.image,
                    durationOverride: override
                ))
            }
        }

        frames.append(contentsOf: imported)

        if hadNoFrames {
            selectedFrameID = frames.first?.id
        }
    }

    func importDroppedProviders(_ providers: [NSItemProvider]) -> Bool {
        var accepted = false

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            accepted = true
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { [weak self] item, _ in
                guard let url = Self.url(fromProviderItem: item) else { return }
                Task { @MainActor in
                    do {
                        try self?.addFiles([url])
                    } catch {
                        self?.errorMessage = error.localizedDescription
                    }
                }
            }
        }

        return accepted
    }

    func export(to url: URL) throws {
        let sourceFrames = frames.map {
            GIFSourceFrame(image: $0.cgImage, duration: $0.duration(default: defaultDuration))
        }
        let options = GIFRenderOptions(width: width, height: height, fitMethod: fitMethod)
        try GIFEncoder.export(
            frames: sourceFrames,
            to: url,
            options: options,
            loopMode: loopMode,
            engine: exportEngine,
            quality: quality
        )
    }

    func select(_ frame: FrameItem) {
        selectedFrameID = frame.id
        lastAdvanceDate = Date()
    }

    func remove(_ frame: FrameItem) {
        guard let index = frames.firstIndex(of: frame) else { return }
        frames.remove(at: index)

        if selectedFrameID == frame.id {
            if frames.indices.contains(index) {
                selectedFrameID = frames[index].id
            } else {
                selectedFrameID = frames.last?.id
            }
        }

        if frames.isEmpty {
            isPlaying = false
        }
    }

    func clearFrames() {
        frames.removeAll()
        selectedFrameID = nil
        isPlaying = false
    }

    func setDefaultDuration(_ duration: TimeInterval) {
        defaultDuration = max(0.02, duration)
        lastAdvanceDate = Date()
    }

    func setFrameDuration(_ frame: FrameItem, duration: TimeInterval?) {
        setFrameDuration(id: frame.id, duration: duration)
    }

    func setFrameDuration(id frameID: FrameItem.ID, duration: TimeInterval?) {
        guard let index = frames.firstIndex(where: { $0.id == frameID }) else { return }
        var updatedFrames = frames
        var updatedFrame = updatedFrames[index]
        updatedFrame.durationOverride = duration
        updatedFrames[index] = updatedFrame
        frames = updatedFrames
        lastAdvanceDate = Date()
    }

    func setWidth(_ value: Int) {
        width = max(1, value)
        if lockAspectRatio {
            height = max(1, Int((Double(width) / lockedAspectRatio).rounded()))
        }
    }

    func setHeight(_ value: Int) {
        height = max(1, value)
        if lockAspectRatio {
            width = max(1, Int((Double(height) * lockedAspectRatio).rounded()))
        }
    }

    func setLockAspectRatio(_ isLocked: Bool) {
        lockAspectRatio = isLocked
        if isLocked {
            lockedAspectRatio = aspectRatio
        }
    }

    func togglePlayback() {
        guard !frames.isEmpty else { return }
        isPlaying.toggle()
        lastAdvanceDate = Date()
    }

    func previousFrame() {
        guard !frames.isEmpty else { return }
        let index = selectedIndex ?? 0
        let previousIndex = index == 0 ? frames.count - 1 : index - 1
        selectedFrameID = frames[previousIndex].id
        lastAdvanceDate = Date()
    }

    func nextFrame() {
        guard !frames.isEmpty else { return }
        let index = selectedIndex ?? 0
        let nextIndex = index == frames.count - 1 ? 0 : index + 1
        selectedFrameID = frames[nextIndex].id
        lastAdvanceDate = Date()
    }

    func tickPlayback(at date: Date) {
        guard isPlaying, !frames.isEmpty, let frame = selectedFrame else { return }

        if date.timeIntervalSince(lastAdvanceDate) >= frame.duration(default: defaultDuration) {
            if selectedIndex == frames.count - 1, loopMode == .once {
                isPlaying = false
                return
            }

            nextFrame()
            lastAdvanceDate = date
        }
    }

    func moveFrame(id movingID: FrameItem.ID, before targetID: FrameItem.ID) {
        guard
            movingID != targetID,
            let sourceIndex = frames.firstIndex(where: { $0.id == movingID }),
            let movingFrame = frames[safe: sourceIndex]
        else {
            return
        }

        frames.remove(at: sourceIndex)
        let targetIndex = frames.firstIndex(where: { $0.id == targetID }) ?? frames.count
        frames.insert(movingFrame, at: targetIndex)
    }

    func moveFrame(id movingID: FrameItem.ID, to destinationIndex: Int) {
        guard
            let sourceIndex = frames.firstIndex(where: { $0.id == movingID }),
            let movingFrame = frames[safe: sourceIndex]
        else {
            return
        }

        frames.remove(at: sourceIndex)
        let clampedIndex = min(max(0, destinationIndex), frames.count)
        frames.insert(movingFrame, at: clampedIndex)
    }

    nonisolated private static func url(fromProviderItem item: NSSecureCoding?) -> URL? {
        if let url = item as? URL {
            return url
        }

        if let data = item as? Data,
           let string = String(data: data, encoding: .utf8) {
            return URL(string: string)
        }

        if let string = item as? String {
            return URL(string: string)
        }

        return nil
    }
}

private extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
