import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

public enum FitMethod: String, CaseIterable, Identifiable {
    case fill
    case fit
    case stretch

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .fill: "Fill"
        case .fit: "Fit"
        case .stretch: "Stretch"
        }
    }

    public var helpText: String {
        switch self {
        case .fill: "Fill the export size and crop overflow."
        case .fit: "Fit the whole frame and pad empty space."
        case .stretch: "Stretch every frame to the export size."
        }
    }
}

public enum GIFLoopMode: Equatable, Identifiable {
    case infinite
    case once
    case count(Int)

    public var id: String { displayName }

    public var displayName: String {
        switch self {
        case .infinite:
            return "Infinite"
        case .once:
            return "Once"
        case .count(let count):
            return "\(count)x"
        }
    }

    var imageIOLoopCount: Int? {
        switch self {
        case .infinite:
            return 0
        case .once:
            return nil
        case .count(let count):
            return max(1, count)
        }
    }
}

public enum GIFQuality: Double, CaseIterable, Identifiable {
    case best = 1.0
    case balanced = 0.82
    case compact = 0.65

    public var id: Double { rawValue }

    public var displayName: String {
        switch self {
        case .best:
            return "Best"
        case .balanced:
            return "Balanced"
        case .compact:
            return "Compact"
        }
    }

    var usesLocalColorMaps: Bool {
        self == .best
    }

    var gifskiQuality: Int {
        switch self {
        case .best:
            return 100
        case .balanced:
            return 85
        case .compact:
            return 65
        }
    }
}

public enum GIFExportEngine: String, CaseIterable, Identifiable {
    case apple
    case gifski

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .apple:
            return "Apple GIF"
        case .gifski:
            return "Gifski"
        }
    }

    public var helpText: String {
        switch self {
        case .apple:
            return "Fast native export. Good for simple graphics."
        case .gifski:
            return "Slower high-quality export for gradients, photos, and motion."
        }
    }
}

public struct GIFRenderOptions {
    public var width: Int
    public var height: Int
    public var fitMethod: FitMethod
    public var backgroundColor: CGColor

    public init(
        width: Int,
        height: Int,
        fitMethod: FitMethod = .fill,
        backgroundColor: CGColor = CGColor(gray: 1, alpha: 1)
    ) {
        self.width = width
        self.height = height
        self.fitMethod = fitMethod
        self.backgroundColor = backgroundColor
    }

    public var size: CGSize {
        CGSize(width: width, height: height)
    }
}

public struct GIFSourceFrame {
    public var image: CGImage
    public var duration: TimeInterval

    public init(image: CGImage, duration: TimeInterval) {
        self.image = image
        self.duration = duration
    }
}

public enum GIFExportError: LocalizedError, Equatable {
    case noFrames
    case invalidSize
    case cannotCreateDestination(URL)
    case cannotCreateContext(width: Int, height: Int)
    case imageCouldNotLoad(URL)
    case pngWriteFailed(URL)
    case gifskiNotInstalled
    case gifskiFailed(String)
    case writeFailed(URL)

    public var errorDescription: String? {
        switch self {
        case .noFrames:
            return "Add at least one frame before exporting."
        case .invalidSize:
            return "Width and height must be positive whole pixels."
        case .cannotCreateDestination(let url):
            return "Could not create a GIF at \(url.path)."
        case .cannotCreateContext(let width, let height):
            return "Could not create a \(width)x\(height) render context."
        case .imageCouldNotLoad(let url):
            return "Could not load image frames from \(url.lastPathComponent)."
        case .pngWriteFailed(let url):
            return "Could not write a temporary PNG frame at \(url.path)."
        case .gifskiNotInstalled:
            return "Gifski is unavailable. Rebuild the app so the bundled encoder is included, or install it with `brew install gifski` for development."
        case .gifskiFailed(let message):
            return message.isEmpty ? "Gifski export failed." : "Gifski export failed: \(message)"
        case .writeFailed(let url):
            return "Could not write the GIF to \(url.path)."
        }
    }
}

public enum GIFEncoder {
    public static let supportedImageTypes: [UTType] = [
        .png,
        .jpeg,
        .tiff,
        .gif,
        .bmp,
        .heic
    ]

    public static func loadFrames(from url: URL, defaultDuration: TimeInterval) throws -> [GIFSourceFrame] {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            throw GIFExportError.imageCouldNotLoad(url)
        }

        let count = max(1, CGImageSourceGetCount(source))
        var frames: [GIFSourceFrame] = []
        frames.reserveCapacity(count)

        for index in 0..<count {
            guard let image = transformedImage(at: index, source: source) else {
                throw GIFExportError.imageCouldNotLoad(url)
            }

            let duration = delayTime(at: index, source: source) ?? defaultDuration
            frames.append(GIFSourceFrame(image: image, duration: sanitizedDuration(duration)))
        }

        return frames
    }

    public static func render(image: CGImage, options: GIFRenderOptions) throws -> CGImage {
        guard options.width > 0, options.height > 0 else {
            throw GIFExportError.invalidSize
        }

        let width = options.width
        let height = options.height
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else {
            throw GIFExportError.cannotCreateContext(width: width, height: height)
        }

        let canvas = CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height))
        context.setFillColor(options.backgroundColor)
        context.fill(canvas)
        context.interpolationQuality = .high

        let drawRect = drawRect(
            imageSize: CGSize(width: image.width, height: image.height),
            canvasSize: canvas.size,
            fitMethod: options.fitMethod
        )
        context.draw(image, in: drawRect)

        guard let rendered = context.makeImage() else {
            throw GIFExportError.cannotCreateContext(width: width, height: height)
        }

        return rendered
    }

    public static func export(
        frames: [GIFSourceFrame],
        to url: URL,
        options: GIFRenderOptions,
        loopMode: GIFLoopMode,
        engine: GIFExportEngine = .apple,
        quality: GIFQuality = .best
    ) throws {
        guard !frames.isEmpty else {
            throw GIFExportError.noFrames
        }

        guard options.width > 0, options.height > 0 else {
            throw GIFExportError.invalidSize
        }

        switch engine {
        case .apple:
            try exportWithImageIO(frames: frames, to: url, options: options, loopMode: loopMode, quality: quality)
        case .gifski:
            try exportWithGifski(frames: frames, to: url, options: options, loopMode: loopMode, quality: quality)
        }
    }

    private static func exportWithImageIO(
        frames: [GIFSourceFrame],
        to url: URL,
        options: GIFRenderOptions,
        loopMode: GIFLoopMode,
        quality: GIFQuality
    ) throws {
        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL,
            UTType.gif.identifier as CFString,
            frames.count,
            nil
        ) else {
            throw GIFExportError.cannotCreateDestination(url)
        }

        var gifProperties: [CFString: Any] = [:]
        if let loopCount = loopMode.imageIOLoopCount {
            gifProperties[kCGImagePropertyGIFLoopCount] = loopCount
        }
        gifProperties[kCGImagePropertyGIFHasGlobalColorMap] = !quality.usesLocalColorMaps

        CGImageDestinationSetProperties(destination, [
            kCGImageDestinationLossyCompressionQuality: quality.rawValue,
            kCGImageDestinationOptimizeColorForSharing: quality != .best,
            kCGImagePropertyGIFDictionary: gifProperties
        ] as CFDictionary)

        for frame in frames {
            let rendered = try render(image: frame.image, options: options)
            CGImageDestinationAddImage(destination, rendered, [
                kCGImageDestinationLossyCompressionQuality: quality.rawValue,
                kCGImageDestinationOptimizeColorForSharing: quality != .best,
                kCGImagePropertyDepth: 8,
                kCGImagePropertyGIFDictionary: [
                    kCGImagePropertyGIFDelayTime: sanitizedDuration(frame.duration),
                    kCGImagePropertyGIFUnclampedDelayTime: sanitizedDuration(frame.duration),
                    kCGImagePropertyGIFHasGlobalColorMap: !quality.usesLocalColorMaps
                ]
            ] as CFDictionary)
        }

        guard CGImageDestinationFinalize(destination) else {
            throw GIFExportError.writeFailed(url)
        }
    }

    private static func exportWithGifski(
        frames: [GIFSourceFrame],
        to url: URL,
        options: GIFRenderOptions,
        loopMode: GIFLoopMode,
        quality: GIFQuality
    ) throws {
        guard let gifskiURL = gifskiExecutableURL() else {
            throw GIFExportError.gifskiNotInstalled
        }

        let fileManager = FileManager.default
        let temporaryDirectory = fileManager.temporaryDirectory
            .appendingPathComponent("Gifferson-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        defer {
            try? fileManager.removeItem(at: temporaryDirectory)
        }

        let durationUnits = frames.map { centiseconds(for: $0.duration) }
        let unit = max(2, durationUnits.reduce(durationUnits[0], greatestCommonDivisor))
        let fps = Double(100) / Double(unit)

        var sourcePNGURLs: [URL] = []
        sourcePNGURLs.reserveCapacity(frames.count)

        for (index, frame) in frames.enumerated() {
            let rendered = try render(image: frame.image, options: options)
            let frameURL = temporaryDirectory.appendingPathComponent(String(format: "source-%06d.png", index))
            try writePNG(rendered, to: frameURL)
            sourcePNGURLs.append(frameURL)
        }

        var expandedFrameURLs: [URL] = []
        for (index, sourceURL) in sourcePNGURLs.enumerated() {
            let repeatCount = max(1, Int(round(Double(durationUnits[index]) / Double(unit))))
            for _ in 0..<repeatCount {
                let expandedURL = temporaryDirectory
                    .appendingPathComponent(String(format: "frame-%06d.png", expandedFrameURLs.count))
                try linkOrCopy(sourceURL, to: expandedURL)
                expandedFrameURLs.append(expandedURL)
            }
        }

        let process = Process()
        process.executableURL = gifskiURL
        process.arguments = gifskiArguments(
            frameURLs: expandedFrameURLs,
            outputURL: url,
            options: options,
            fps: fps,
            loopMode: loopMode,
            quality: quality
        )

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            throw GIFExportError.gifskiFailed(error.localizedDescription)
        }

        guard process.terminationStatus == 0 else {
            let output = String(data: outputPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let error = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            throw GIFExportError.gifskiFailed([output, error].joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines))
        }
    }

    private static func transformedImage(at index: Int, source: CGImageSource) -> CGImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageIfAbsent: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCache: true
        ]

        return CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary)
            ?? CGImageSourceCreateImageAtIndex(source, index, options as CFDictionary)
    }

    private static func delayTime(at index: Int, source: CGImageSource) -> TimeInterval? {
        guard
            let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
            let gifProperties = properties[kCGImagePropertyGIFDictionary] as? [CFString: Any]
        else {
            return nil
        }

        let unclamped = gifProperties[kCGImagePropertyGIFUnclampedDelayTime] as? TimeInterval
        let clamped = gifProperties[kCGImagePropertyGIFDelayTime] as? TimeInterval
        return unclamped.flatMap { $0 > 0 ? $0 : nil }
            ?? clamped.flatMap { $0 > 0 ? $0 : nil }
    }

    private static func sanitizedDuration(_ duration: TimeInterval) -> TimeInterval {
        min(60, max(0.02, duration))
    }

    private static func writePNG(_ image: CGImage, to url: URL) throws {
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw GIFExportError.pngWriteFailed(url)
        }

        CGImageDestinationAddImage(destination, image, nil)

        guard CGImageDestinationFinalize(destination) else {
            throw GIFExportError.pngWriteFailed(url)
        }
    }

    private static func linkOrCopy(_ sourceURL: URL, to destinationURL: URL) throws {
        do {
            try FileManager.default.linkItem(at: sourceURL, to: destinationURL)
        } catch {
            try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
        }
    }

    private static func centiseconds(for duration: TimeInterval) -> Int {
        max(2, min(6_000, Int((sanitizedDuration(duration) * 100).rounded())))
    }

    private static func greatestCommonDivisor(_ lhs: Int, _ rhs: Int) -> Int {
        var a = lhs
        var b = rhs
        while b != 0 {
            let remainder = a % b
            a = b
            b = remainder
        }
        return abs(a)
    }

    private static func gifskiExecutableURL() -> URL? {
        let environment = ProcessInfo.processInfo.environment
        if let path = environment["GIFSKI_PATH"], FileManager.default.isExecutableFile(atPath: path) {
            return URL(fileURLWithPath: path)
        }

        if let bundledURL = Bundle.main.url(forResource: "gifski", withExtension: nil, subdirectory: "bin"),
           FileManager.default.isExecutableFile(atPath: bundledURL.path) {
            return bundledURL
        }

        let pathDirectories = (environment["PATH"] ?? "")
            .split(separator: ":")
            .map(String.init)
        let directories = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/opt/local/bin"
        ] + pathDirectories

        for directory in directories {
            let path = URL(fileURLWithPath: directory).appendingPathComponent("gifski").path
            if FileManager.default.isExecutableFile(atPath: path) {
                return URL(fileURLWithPath: path)
            }
        }

        return nil
    }

    private static func gifskiArguments(
        frameURLs: [URL],
        outputURL: URL,
        options: GIFRenderOptions,
        fps: Double,
        loopMode: GIFLoopMode,
        quality: GIFQuality
    ) -> [String] {
        var arguments = [
            "--fps",
            formatFPS(fps),
            "--width",
            "\(options.width)",
            "--height",
            "\(options.height)",
            "--quality=\(quality.gifskiQuality)",
            "--motion-quality=\(quality.gifskiQuality)",
            "--lossy-quality=\(quality.gifskiQuality)",
            "--no-sort",
            "--quiet",
            "--repeat",
            gifskiRepeatValue(for: loopMode),
            "--output",
            outputURL.path
        ]
        arguments.append(contentsOf: frameURLs.map(\.path))
        return arguments
    }

    private static func gifskiRepeatValue(for loopMode: GIFLoopMode) -> String {
        switch loopMode {
        case .infinite:
            return "0"
        case .once:
            return "-1"
        case .count(let count):
            return "\(max(1, count))"
        }
    }

    private static func formatFPS(_ fps: Double) -> String {
        if fps.rounded() == fps {
            return "\(Int(fps))"
        }

        return String(format: "%.3f", fps)
    }

    private static func drawRect(imageSize: CGSize, canvasSize: CGSize, fitMethod: FitMethod) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return CGRect(origin: .zero, size: canvasSize)
        }

        switch fitMethod {
        case .stretch:
            return CGRect(origin: .zero, size: canvasSize)
        case .fit, .fill:
            let widthScale = canvasSize.width / imageSize.width
            let heightScale = canvasSize.height / imageSize.height
            let scale = fitMethod == .fill ? max(widthScale, heightScale) : min(widthScale, heightScale)
            let size = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
            return CGRect(
                x: (canvasSize.width - size.width) / 2,
                y: (canvasSize.height - size.height) / 2,
                width: size.width,
                height: size.height
            )
        }
    }
}
