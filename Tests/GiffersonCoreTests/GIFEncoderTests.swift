import CoreGraphics
import Foundation
import ImageIO
@testable import GiffersonCore
import XCTest

final class GIFEncoderTests: XCTestCase {
    func testExportsAboveEightHundredPixels() throws {
        let frames = [
            GIFSourceFrame(image: try makeImage(color: CGColor(red: 1, green: 0, blue: 0, alpha: 1)), duration: 0.2),
            GIFSourceFrame(image: try makeImage(color: CGColor(red: 0, green: 0, blue: 1, alpha: 1)), duration: 0.2)
        ]
        let url = temporaryURL("large-export.gif")

        try GIFEncoder.export(
            frames: frames,
            to: url,
            options: GIFRenderOptions(width: 1200, height: 900, fitMethod: .fit),
            loopMode: .infinite
        )

        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            return XCTFail("Expected a readable GIF")
        }

        XCTAssertEqual(CGImageSourceGetCount(source), 2)

        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        XCTAssertEqual(properties?[kCGImagePropertyPixelWidth] as? Int, 1200)
        XCTAssertEqual(properties?[kCGImagePropertyPixelHeight] as? Int, 900)
    }

    func testRejectsEmptyExports() {
        XCTAssertThrowsError(
            try GIFEncoder.export(
                frames: [],
                to: temporaryURL("empty.gif"),
                options: GIFRenderOptions(width: 800, height: 450),
                loopMode: .infinite
            )
        )
    }

    func testExportsLargeDimensionsWithGifskiWhenVendoredBinaryIsAvailable() throws {
        let gifskiPath = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("Vendor/gifski/bin/gifski")
            .path
        guard FileManager.default.isExecutableFile(atPath: gifskiPath) else {
            throw XCTSkip("Vendored gifski binary is not available")
        }

        setenv("GIFSKI_PATH", gifskiPath, 1)
        defer {
            unsetenv("GIFSKI_PATH")
        }

        let frames = [
            GIFSourceFrame(image: try makeImage(color: CGColor(red: 1, green: 0, blue: 0, alpha: 1)), duration: 0.1),
            GIFSourceFrame(image: try makeImage(color: CGColor(red: 0, green: 1, blue: 0, alpha: 1)), duration: 0.2),
            GIFSourceFrame(image: try makeImage(color: CGColor(red: 0, green: 0, blue: 1, alpha: 1)), duration: 0.1)
        ]
        let url = temporaryURL("gifski-export.gif")

        try GIFEncoder.export(
            frames: frames,
            to: url,
            options: GIFRenderOptions(width: 1200, height: 675, fitMethod: .fit),
            loopMode: .infinite,
            engine: .gifski,
            quality: .best
        )

        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            return XCTFail("Expected a readable GIF")
        }

        XCTAssertGreaterThanOrEqual(CGImageSourceGetCount(source), 3)

        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        XCTAssertEqual(properties?[kCGImagePropertyPixelWidth] as? Int, 1200)
        XCTAssertEqual(properties?[kCGImagePropertyPixelHeight] as? Int, 675)
    }

    private func makeImage(color: CGColor) throws -> CGImage {
        let width = 32
        let height = 24
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw GIFExportError.cannotCreateContext(width: width, height: height)
        }

        context.setFillColor(color)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))

        guard let image = context.makeImage() else {
            throw GIFExportError.cannotCreateContext(width: width, height: height)
        }

        return image
    }

    private func temporaryURL(_ filename: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(filename)
    }
}
