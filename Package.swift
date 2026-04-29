// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "Gifferson",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "Gifferson", targets: ["Gifferson"])
    ],
    targets: [
        .target(name: "GiffersonCore"),
        .executableTarget(
            name: "Gifferson",
            dependencies: ["GiffersonCore"]
        ),
        .testTarget(
            name: "GiffersonCoreTests",
            dependencies: ["GiffersonCore"]
        )
    ]
)
