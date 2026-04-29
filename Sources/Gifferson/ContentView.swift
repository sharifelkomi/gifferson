import AppKit
import GiffersonCore
import SwiftUI
import UniformTypeIdentifiers

enum AppAppearance: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system:
            return "System"
        case .light:
            return "Light"
        case .dark:
            return "Dark"
        }
    }

    var iconName: String {
        switch self {
        case .system:
            return "circle.lefthalf.filled"
        case .light:
            return "sun.max"
        case .dark:
            return "moon"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system:
            return nil
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }
}

struct ContentView: View {
    @StateObject private var model = GIFDocumentModel()
    @AppStorage("appearanceMode") private var appearanceRawValue = AppAppearance.system.rawValue
    @State private var showingImporter = false

    private let playbackTimer = Timer.publish(every: 0.04, on: .main, in: .common).autoconnect()

    private var appearance: AppAppearance {
        get { AppAppearance(rawValue: appearanceRawValue) ?? .system }
        nonmutating set { appearanceRawValue = newValue.rawValue }
    }

    var body: some View {
        MainWorkspace(
            model: model,
            appearance: Binding(get: { appearance }, set: { appearance = $0 }),
            onAddFrames: { showingImporter = true },
            onExport: exportGIF
        )
        .fileImporter(
            isPresented: $showingImporter,
            allowedContentTypes: GIFEncoder.supportedImageTypes,
            allowsMultipleSelection: true,
            onCompletion: importFiles
        )
        .onReceive(playbackTimer) { date in
            model.tickPlayback(at: date)
        }
        .alert("Gifferson", isPresented: errorIsPresented) {
            Button("OK", role: .cancel) {
                model.errorMessage = nil
            }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .preferredColorScheme(appearance.colorScheme)
    }

    private var errorIsPresented: Binding<Bool> {
        Binding(
            get: { model.errorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    model.errorMessage = nil
                }
            }
        )
    }

    @MainActor
    private func importFiles(_ result: Result<[URL], Error>) {
        do {
            try model.addFiles(try result.get())
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func exportGIF() {
        guard !model.frames.isEmpty else {
            model.errorMessage = "Add at least one frame before exporting."
            return
        }

        let panel = NSSavePanel()
        panel.allowedContentTypes = [.gif]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "animation.gif"
        panel.begin { response in
            Task { @MainActor in
                guard response == .OK, let url = panel.url else { return }
                do {
                    try model.export(to: url)
                } catch {
                    model.errorMessage = error.localizedDescription
                }
            }
        }
    }
}

struct MainWorkspace: View {
    @ObservedObject var model: GIFDocumentModel
    @Binding var appearance: AppAppearance
    let onAddFrames: () -> Void
    let onExport: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HeaderBar(model: model, onAddFrames: onAddFrames, onExport: onExport)

            PreviewStage(model: model, onAddFrames: onAddFrames)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            TimelineStrip(model: model, onAddFrames: onAddFrames)
                .frame(height: 136)
                .padding(.horizontal, 18)
                .padding(.top, 2)
                .padding(.bottom, 10)

            SettingsStrip(model: model, appearance: $appearance)
                .padding(.horizontal, 18)
                .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppColor.window)
        .ignoresSafeArea(.container, edges: .top)
        .background(WindowFocusSuppressor())
    }
}

struct WindowFocusSuppressor: NSViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> NSView {
        let view = NoFocusView()
        DispatchQueue.main.async {
            context.coordinator.attach(to: view.window, focusView: view)
        }
        return view
    }

    func updateNSView(_ view: NSView, context: Context) {
        DispatchQueue.main.async {
            context.coordinator.attach(to: view.window, focusView: view)
        }
    }

    final class NoFocusView: NSView {
        override var acceptsFirstResponder: Bool { true }

        override var focusRingType: NSFocusRingType {
            get { .none }
            set {}
        }

        override func becomeFirstResponder() -> Bool {
            true
        }
    }

    final class Coordinator {
        private weak var window: NSWindow?
        private var keyMonitor: Any?

        func attach(to window: NSWindow?, focusView: NSView) {
            guard let window else { return }

            window.defaultButtonCell = nil
            window.initialFirstResponder = focusView
            layoutWindowButtons(in: window)

            if window.firstResponder == nil || window.firstResponder is NSButton {
                window.makeFirstResponder(focusView)
            }

            guard self.window !== window else { return }
            self.window = window

            if let keyMonitor {
                NSEvent.removeMonitor(keyMonitor)
            }

            keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak window, weak focusView] event in
                guard event.window === window else { return event }

                if event.keyCode == 48 {
                    if let focusView {
                        window?.makeFirstResponder(focusView)
                    }
                    return nil
                }

                return event
            }
        }

        deinit {
            if let keyMonitor {
                NSEvent.removeMonitor(keyMonitor)
            }
        }

        private func layoutWindowButtons(in window: NSWindow) {
            guard let closeButton = window.standardWindowButton(.closeButton),
                  let buttonSuperview = closeButton.superview
            else {
                return
            }

            let leftPadding: CGFloat = 20
            let topPadding: CGFloat = 20
            let closeFrame = closeButton.frame
            let y = buttonSuperview.bounds.height - topPadding - closeFrame.height
            let miniaturizeButton = window.standardWindowButton(.miniaturizeButton)
            let zoomButton = window.standardWindowButton(.zoomButton)
            let miniaturizeOffset = (miniaturizeButton?.frame.minX ?? closeFrame.minX + 23) - closeFrame.minX
            let zoomOffset = (zoomButton?.frame.minX ?? closeFrame.minX + 46) - closeFrame.minX

            closeButton.setFrameOrigin(NSPoint(x: leftPadding, y: y))
            miniaturizeButton?.setFrameOrigin(NSPoint(x: leftPadding + miniaturizeOffset, y: y))
            zoomButton?.setFrameOrigin(NSPoint(x: leftPadding + zoomOffset, y: y))
        }
    }
}

struct HeaderBar: View {
    @ObservedObject var model: GIFDocumentModel
    let onAddFrames: () -> Void
    let onExport: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Color.clear
                .frame(width: 64)

            HeaderPill(systemName: "photo.stack", text: "\(model.frames.count) frames")
            HeaderPill(systemName: "aspectratio", text: "\(model.width)x\(model.height)")
            HeaderPill(systemName: "clock", text: formatTotalDuration(model.totalDuration))

            Spacer(minLength: 16)

            HeaderActionPill(title: "Add", systemName: "plus", action: onAddFrames)

            HeaderActionPill(
                title: "Export",
                systemName: "square.and.arrow.down",
                isAccent: true,
                isDisabled: model.frames.isEmpty,
                action: onExport
            )
        }
        .padding(.leading, 20)
        .padding(.trailing, 13)
        .frame(height: 54)
        .background(AppColor.previewBackdrop)
    }
}

struct PreviewStage: View {
    @ObservedObject var model: GIFDocumentModel
    let onAddFrames: () -> Void
    @State private var isDropTargeted = false

    var body: some View {
        GeometryReader { proxy in
            let canvasSize = previewSize(in: proxy.size)

            ZStack {
                AppColor.previewBackdrop

                if let frame = model.selectedFrame {
                    PreviewCanvas(frame: frame, fitMethod: model.fitMethod)
                        .frame(width: canvasSize.width, height: canvasSize.height)
                } else {
                    EmptyPreview(onAddFrames: onAddFrames)
                        .frame(width: min(420, proxy.size.width * 0.64), height: 220)
                }

                VStack {
                    Spacer()
                    PlaybackBar(model: model)
                        .padding(.bottom, 18)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isDropTargeted ? AppColor.pink.opacity(0.8) : Color.clear, lineWidth: 2)
                    .padding(16)
            }
        }
        .contentShape(Rectangle())
        .onDrop(of: [UTType.fileURL], isTargeted: $isDropTargeted) { providers in
            model.importDroppedProviders(providers)
        }
    }

    private func previewSize(in available: CGSize) -> CGSize {
        let ratio = max(0.1, Double(model.width) / Double(max(1, model.height)))
        let maxWidth = max(260, available.width * 0.90)
        let maxHeight = max(200, available.height * 0.80)
        var width = maxWidth
        var height = width / ratio

        if height > maxHeight {
            height = maxHeight
            width = height * ratio
        }

        return CGSize(width: width, height: height)
    }
}

struct PreviewCanvas: View {
    let frame: FrameItem
    let fitMethod: FitMethod

    var body: some View {
        ZStack {
            Color.white
            previewImage
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: .black.opacity(0.24), radius: 22, x: 0, y: 12)
    }

    @ViewBuilder
    private var previewImage: some View {
        switch fitMethod {
        case .stretch:
            Image(nsImage: frame.previewImage)
                .resizable()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .fill:
            Image(nsImage: frame.previewImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        case .fit:
            Image(nsImage: frame.previewImage)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct EmptyPreview: View {
    let onAddFrames: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "photo.badge.plus")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(AppColor.pink)

            Text("Drop images here")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(AppColor.primaryText)

            Text("Add Frames")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(AppColor.primaryText)
                .padding(.horizontal, 16)
                .frame(height: 34)
                .background(AppColor.control)
                .clipShape(Capsule())
                .contentShape(Capsule())
                .onTapGesture(perform: onAddFrames)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct PlaybackBar: View {
    @ObservedObject var model: GIFDocumentModel

    var body: some View {
        HStack(spacing: 8) {
            CircleIconButton(systemName: "arrow.left", disabled: model.frames.isEmpty) {
                model.previousFrame()
            }

            CircleIconButton(systemName: model.isPlaying ? "pause.fill" : "play.fill", disabled: model.frames.isEmpty, isPrimary: true) {
                model.togglePlayback()
            }

            CircleIconButton(systemName: "arrow.right", disabled: model.frames.isEmpty) {
                model.nextFrame()
            }

            Divider()
                .frame(height: 22)
                .overlay(AppColor.separator)
                .padding(.horizontal, 4)

            Text(playbackText)
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundStyle(AppColor.primaryText)
                .frame(minWidth: 76, alignment: .leading)
        }
        .padding(8)
        .background(AppColor.floatingBar)
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.16), radius: 16, x: 0, y: 8)
    }

    private var playbackText: String {
        guard let index = model.selectedIndex else {
            return "0 / 0"
        }

        return "\(index + 1) / \(model.frames.count)"
    }
}

struct TimelineStrip: View {
    @ObservedObject var model: GIFDocumentModel
    let onAddFrames: () -> Void
    @State private var scrollOffset: CGFloat = 0
    @State private var dragStartOffset: CGFloat?

    private let cardHeight: CGFloat = 112
    private let addButtonWidth: CGFloat = 48
    private let emptyButtonWidth: CGFloat = 150
    private let itemSpacing: CGFloat = 10
    private let stripPadding: CGFloat = 10

    var body: some View {
        GeometryReader { proxy in
            let contentWidth = timelineContentWidth
            let maxOffset = max(0, contentWidth - proxy.size.width)
            let visibleOffset = min(scrollOffset, maxOffset)

            ZStack(alignment: .leading) {
                AppColor.timelineBackground
                    .contentShape(Rectangle())
                    .gesture(scrollDragGesture(maxOffset: maxOffset))

                HStack(spacing: itemSpacing) {
                    if model.frames.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "plus")
                            Text("Add frames")
                        }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(AppColor.primaryText)
                        .frame(width: emptyButtonWidth, height: 112)
                        .background(AppColor.control)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .onTapGesture(perform: onAddFrames)
                    } else {
                        ForEach(model.frames) { frame in
                            FrameCard(
                                model: model,
                                frame: frame,
                                width: cardWidth(for: frame),
                                height: cardHeight,
                                onDragLocation: { locationX in
                                    reorderFrame(
                                        id: frame.id,
                                        locationX: locationX,
                                        viewportWidth: proxy.size.width,
                                        maxOffset: maxOffset
                                    )
                                },
                                onDragEnded: {
                                    model.draggingFrameID = nil
                                }
                            )
                        }

                        Image(systemName: "plus")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(AppColor.primaryText)
                            .frame(width: addButtonWidth, height: cardHeight)
                            .background(AppColor.control)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .onTapGesture(perform: onAddFrames)
                    }
                }
                .padding(stripPadding)
                .frame(width: contentWidth, alignment: .leading)
                .offset(x: -visibleOffset)
                .animation(.interactiveSpring(response: 0.24, dampingFraction: 0.84, blendDuration: 0.10), value: model.frames.map(\.id))
            }
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            .coordinateSpace(name: "timeline-strip")
            .onChange(of: model.frames.count) {
                scrollOffset = min(scrollOffset, maxOffset)
            }
        }
    }

    private var timelineContentWidth: CGFloat {
        if model.frames.isEmpty {
            return emptyButtonWidth + (stripPadding * 2)
        }

        return model.frames.reduce(0) { $0 + cardWidth(for: $1) }
            + addButtonWidth
            + (CGFloat(model.frames.count) * itemSpacing)
            + (stripPadding * 2)
    }

    private func scrollDragGesture(maxOffset: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                if dragStartOffset == nil {
                    dragStartOffset = scrollOffset
                }

                let startOffset = dragStartOffset ?? scrollOffset
                scrollOffset = clamp(startOffset - value.translation.width, min: 0, max: maxOffset)
            }
            .onEnded { _ in
                dragStartOffset = nil
            }
    }

    private func clamp(_ value: CGFloat, min minimum: CGFloat, max maximum: CGFloat) -> CGFloat {
        Swift.min(Swift.max(value, minimum), maximum)
    }

    private func reorderFrame(id: FrameItem.ID, locationX: CGFloat, viewportWidth: CGFloat, maxOffset: CGFloat) {
        guard model.frames.count > 1 else { return }

        let edgeDistance: CGFloat = 72
        if locationX < edgeDistance {
            scrollOffset = max(0, scrollOffset - 12)
        } else if locationX > viewportWidth - edgeDistance {
            scrollOffset = min(maxOffset, scrollOffset + 12)
        }

        let contentX = max(0, locationX + scrollOffset - stripPadding)
        let destinationIndex = destinationIndex(for: contentX)

        withAnimation(.interactiveSpring(response: 0.24, dampingFraction: 0.84, blendDuration: 0.10)) {
            model.moveFrame(id: id, to: destinationIndex)
        }
    }

    private func destinationIndex(for contentX: CGFloat) -> Int {
        var cursor: CGFloat = 0

        for (index, frame) in model.frames.enumerated() {
            let width = cardWidth(for: frame)
            if contentX < cursor + (width / 2) {
                return index
            }
            cursor += width + itemSpacing
        }

        return max(0, model.frames.count - 1)
    }

    private func cardWidth(for frame: FrameItem) -> CGFloat {
        let ratio = CGFloat(frame.cgImage.width) / CGFloat(max(1, frame.cgImage.height))
        return max(64, (cardHeight * ratio).rounded())
    }
}

struct FrameCard: View {
    @ObservedObject var model: GIFDocumentModel
    let frame: FrameItem
    let width: CGFloat
    let height: CGFloat
    let onDragLocation: (CGFloat) -> Void
    let onDragEnded: () -> Void
    @State private var isHovering = false

    private var isSelected: Bool {
        model.selectedFrame?.id == frame.id
    }

    var body: some View {
        GeometryReader { proxy in
            let imageRect = fittedImageRect(
                imageSize: CGSize(width: frame.cgImage.width, height: frame.cgImage.height),
                containerSize: proxy.size
            )

            ZStack {
                AppColor.control

                ZStack {
                    Image(nsImage: frame.previewImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: imageRect.width, height: imageRect.height)

                    LinearGradient(
                        colors: [.clear, .black.opacity(0.42)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: min(54, imageRect.height))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .allowsHitTesting(false)

                    FrameDurationMenu(model: model, frameID: frame.id)
                        .padding(.leading, 10)
                        .padding(.bottom, 10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

                    if isHovering {
                        DeleteFrameButton {
                            model.remove(frame)
                        }
                        .padding(.top, 10)
                        .padding(.trailing, 10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .transition(.opacity)
                    }
                }
                .frame(width: imageRect.width, height: imageRect.height)
                .position(x: imageRect.midX, y: imageRect.midY)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .frame(width: width, height: height)
        .background(isSelected ? AppColor.selectedFrame : AppColor.frameBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(isSelected ? AppColor.pink : AppColor.panelBorder, lineWidth: isSelected ? 2 : 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .onTapGesture {
            model.select(frame)
        }
        .onHover { isHovering = $0 }
        .gesture(reorderDragGesture)
        .zIndex(model.draggingFrameID == frame.id ? 1 : 0)
    }

    private var reorderDragGesture: some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .named("timeline-strip"))
            .onChanged { value in
                if model.draggingFrameID != frame.id {
                    model.draggingFrameID = frame.id
                    model.select(frame)
                }
                onDragLocation(value.location.x)
            }
            .onEnded { _ in
                onDragEnded()
            }
    }

    private func fittedImageRect(imageSize: CGSize, containerSize: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return CGRect(origin: .zero, size: containerSize)
        }

        let imageRatio = imageSize.width / imageSize.height
        let containerRatio = containerSize.width / containerSize.height
        let size: CGSize

        if imageRatio > containerRatio {
            size = CGSize(width: containerSize.width, height: containerSize.width / imageRatio)
        } else {
            size = CGSize(width: containerSize.height * imageRatio, height: containerSize.height)
        }

        return CGRect(
            x: (containerSize.width - size.width) / 2,
            y: (containerSize.height - size.height) / 2,
            width: size.width,
            height: size.height
        )
    }
}

struct FrameDurationMenu: View {
    @ObservedObject var model: GIFDocumentModel
    let frameID: FrameItem.ID
    @State private var isShowingMenu = false

    var body: some View {
        durationBadge
            .contentShape(Capsule())
            .onTapGesture {
                isShowingMenu = true
            }
            .fixedSize()
            .popover(isPresented: $isShowingMenu, arrowEdge: .bottom) {
                FrameDurationPopover(
                    model: model,
                    frameID: frameID,
                    dismiss: { isShowingMenu = false }
                )
            }
    }

    private var durationBadge: some View {
        Text(currentDurationLabel)
            .font(.system(size: 12, weight: .bold, design: .monospaced))
            .foregroundStyle(.white)
            .padding(.horizontal, 9)
            .frame(height: 24)
            .background(.black.opacity(0.54))
            .clipShape(Capsule())
    }

    private var currentDurationLabel: String {
        model.frame(id: frameID)?.durationOverride.map(formatDuration) ?? formatDuration(model.defaultDuration)
    }
}

struct FrameDurationPopover: View {
    @ObservedObject var model: GIFDocumentModel
    let frameID: FrameItem.ID
    let dismiss: () -> Void
    @State private var hoveredOption: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            durationOption("Default") {
                model.setFrameDuration(id: frameID, duration: nil)
            }

            Rectangle()
                .fill(AppColor.separator)
                .frame(height: 1)
                .padding(.vertical, 2)

            ForEach(DurationPreset.presets) { preset in
                durationOption(preset.label) {
                    model.setFrameDuration(id: frameID, duration: preset.value)
                }
            }
        }
        .padding(8)
        .frame(width: 116)
        .background(AppColor.settingsBar)
    }

    private func durationOption(_ title: String, action: @escaping () -> Void) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold, design: .monospaced))
            .foregroundStyle(AppColor.primaryText)
            .frame(maxWidth: .infinity, minHeight: 26, alignment: .leading)
            .padding(.horizontal, 8)
            .background(optionBackground(title))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .onHover { isHovering in
                hoveredOption = isHovering ? title : nil
            }
            .onTapGesture {
                action()
                dismiss()
            }
    }

    private func optionBackground(_ title: String) -> Color {
        if hoveredOption == title {
            return AppColor.controlPressed
        }

        if isSelected(title) {
            return AppColor.control
        }

        return Color.clear
    }

    private func isSelected(_ title: String) -> Bool {
        let durationOverride = model.frame(id: frameID)?.durationOverride

        if title == "Default" {
            return durationOverride == nil
        }

        return durationOverride.map(formatDuration) == title
    }
}

struct DeleteFrameButton: View {
    let action: () -> Void

    var body: some View {
        Image(systemName: "trash.fill")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(.black.opacity(0.54))
            .clipShape(Circle())
            .contentShape(Circle())
            .onTapGesture(perform: action)
    }
}

struct Thumbnail: View {
    let frame: FrameItem

    var body: some View {
        ZStack {
            AppColor.control
            Image(nsImage: frame.previewImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct SettingsStrip: View {
    @ObservedObject var model: GIFDocumentModel
    @Binding var appearance: AppAppearance

    private let loopModes: [GIFLoopMode] = [.infinite, .once, .count(2), .count(3), .count(5)]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 30) {
                CompactMenuControl(title: "Duration", value: formatDuration(model.defaultDuration)) {
                    ForEach(DurationPreset.presets) { preset in
                        Button(preset.label) {
                            model.setDefaultDuration(preset.value)
                        }
                    }
                }

                CompactMenuControl(title: "Loop", value: model.loopMode.displayName) {
                    ForEach(loopModes) { mode in
                        Button(mode.displayName) {
                            model.loopMode = mode
                        }
                    }
                }

                SizeControl(model: model)

                CompactMenuControl(title: "Fit", value: model.fitMethod.displayName) {
                    ForEach(FitMethod.allCases) { method in
                        Button(method.displayName) {
                            model.fitMethod = method
                        }
                    }
                }

                CompactMenuControl(title: "Encoder", value: model.exportEngine.displayName) {
                    ForEach(GIFExportEngine.allCases) { engine in
                        Button(engine.displayName) {
                            model.exportEngine = engine
                        }
                    }
                }

                CompactMenuControl(title: "Quality", value: model.quality.displayName) {
                    ForEach(GIFQuality.allCases) { quality in
                        Button(quality.displayName) {
                            model.quality = quality
                        }
                    }
                }

                CompactMenuControl(title: "Appearance", value: appearance.displayName) {
                    ForEach(AppAppearance.allCases) { option in
                        Button(option.displayName) {
                            appearance = option
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 9)
        }
        .frame(height: 62)
        .background(AppColor.settingsBar)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct CompactMenuControl<MenuContent: View>: View {
    let title: String
    let value: String
    @ViewBuilder let menuContent: () -> MenuContent

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(AppColor.secondaryText)
                .lineLimit(1)

            Menu {
                menuContent()
            } label: {
                HStack(spacing: 5) {
                    Text(value)
                        .lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(AppColor.secondaryText)
                }
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(AppColor.primaryText)
            }
            .buttonStyle(.plain)
        }
        .frame(minWidth: 92, alignment: .leading)
    }
}

struct SizeControl: View {
    @ObservedObject var model: GIFDocumentModel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Size")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(AppColor.secondaryText)

            HStack(spacing: 5) {
                CompactNumberField(value: Binding(get: { model.width }, set: { model.setWidth($0) }))
                Text("x")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(AppColor.secondaryText)
                CompactNumberField(value: Binding(get: { model.height }, set: { model.setHeight($0) }))
                Image(systemName: model.lockAspectRatio ? "lock.fill" : "lock.open")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(AppColor.primaryText)
                    .frame(width: 22, height: 22)
                    .background(AppColor.control)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .onTapGesture {
                        model.setLockAspectRatio(!model.lockAspectRatio)
                    }
            }
        }
        .frame(width: 174, alignment: .leading)
    }
}

struct CompactNumberField: View {
    @Binding var value: Int

    var body: some View {
        TextField("", value: $value, format: .number)
            .font(.system(size: 13, weight: .bold, design: .monospaced))
            .foregroundStyle(AppColor.primaryText)
            .textFieldStyle(.plain)
            .frame(width: 48, height: 22)
            .multilineTextAlignment(.center)
            .background(AppColor.control)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

struct HeaderPill: View {
    let systemName: String
    let text: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemName)
                .font(.system(size: 11, weight: .semibold))
            Text(text)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
        }
        .foregroundStyle(AppColor.secondaryText)
    }
}

struct HeaderActionPill: View {
    let title: String
    let systemName: String
    var isAccent = false
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemName)
                .font(.system(size: 11, weight: .bold))
            Text(title)
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(isAccent ? Color.white : AppColor.primaryText)
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background(backgroundColor)
        .clipShape(Capsule())
        .contentShape(Capsule())
        .opacity(isDisabled ? 0.72 : 1)
        .onTapGesture {
            guard !isDisabled else { return }
            action()
        }
    }

    private var backgroundColor: Color {
        if isDisabled {
            return AppColor.controlDisabled
        }

        return isAccent ? AppColor.pink : AppColor.control
    }
}

struct CircleIconButton: View {
    let systemName: String
    let disabled: Bool
    var isPrimary = false
    let action: () -> Void

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: isPrimary ? 16 : 14, weight: .semibold))
            .foregroundStyle(disabled ? AppColor.disabledText : (isPrimary ? Color.white : AppColor.primaryText))
            .frame(width: isPrimary ? 34 : 30, height: isPrimary ? 34 : 30)
            .background(disabled ? AppColor.controlDisabled : (isPrimary ? AppColor.pink : AppColor.control))
            .clipShape(Circle())
            .contentShape(Circle())
            .onTapGesture {
                guard !disabled else { return }
                action()
            }
    }
}

struct DurationPreset: Identifiable {
    let value: TimeInterval

    var id: TimeInterval { value }
    var label: String { formatDuration(value) }

    static let presets: [DurationPreset] = [0.1, 0.2, 0.3, 0.5, 1.0, 2.0, 5.0].map {
        DurationPreset(value: $0)
    }
}

enum AppColor {
    static let window = adaptive(light: 0.95, dark: 0.075)
    static let previewBackdrop = adaptive(light: 0.93, dark: 0.082)
    static let timelineBackground = adaptive(light: 0.90, dark: 0.13)
    static let settingsBar = adaptive(light: 0.985, dark: 0.14)
    static let frameBackground = adaptive(light: 0.98, dark: 0.18)
    static let selectedFrame = adaptive(
        light: NSColor(calibratedRed: 1.0, green: 0.90, blue: 0.96, alpha: 1),
        dark: NSColor(calibratedRed: 0.22, green: 0.12, blue: 0.18, alpha: 1)
    )
    static let control = adaptive(light: 0.88, dark: 0.24)
    static let controlPressed = adaptive(light: 0.82, dark: 0.30)
    static let controlDisabled = adaptive(light: 0.78, dark: 0.18)
    static let separator = adaptive(light: 0.76, dark: 0.29).opacity(0.62)
    static let panelBorder = adaptive(light: 0.70, dark: 0.32).opacity(0.56)
    static let floatingBar = adaptive(
        light: NSColor(calibratedWhite: 0.985, alpha: 0.94),
        dark: NSColor(calibratedWhite: 0.16, alpha: 0.94)
    )
    static let primaryText = adaptive(light: 0.08, dark: 0.91)
    static let secondaryText = adaptive(light: 0.40, dark: 0.64)
    static let disabledText = adaptive(light: 0.55, dark: 0.42)
    static let pink = Color(nsColor: NSColor(calibratedRed: 0.96, green: 0.24, blue: 0.65, alpha: 1))
    static let orange = Color(nsColor: NSColor(calibratedRed: 1.0, green: 0.43, blue: 0.22, alpha: 1))
    static let yellow = Color(nsColor: NSColor(calibratedRed: 0.96, green: 0.68, blue: 0.08, alpha: 1))
    static let blue = Color(nsColor: NSColor(calibratedRed: 0.28, green: 0.52, blue: 0.98, alpha: 1))
    static let purple = Color(nsColor: NSColor(calibratedRed: 0.56, green: 0.36, blue: 0.96, alpha: 1))
    static let grayIcon = adaptive(light: 0.50, dark: 0.36)

    private static func adaptive(light: CGFloat, dark: CGFloat) -> Color {
        adaptive(
            light: NSColor(calibratedWhite: light, alpha: 1),
            dark: NSColor(calibratedWhite: dark, alpha: 1)
        )
    }

    private static func adaptive(light: NSColor, dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let bestMatch = appearance.bestMatch(from: [.darkAqua, .aqua])
            return bestMatch == .darkAqua ? dark : light
        })
    }
}

func formatDuration(_ value: TimeInterval) -> String {
    if value >= 1, value.rounded() == value {
        return "\(Int(value))s"
    }

    return String(format: "%.1fs", value)
}

func formatTotalDuration(_ value: TimeInterval) -> String {
    let minutes = Int(value / 60)
    let seconds = value - Double(minutes * 60)
    return String(format: "%d:%05.2f", minutes, seconds)
}
