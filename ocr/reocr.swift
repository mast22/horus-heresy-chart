import AppKit
import Foundation
import Vision

// Per-box 3x re-OCR. Only `id` and `box` are read. Extra keys in nodes.json are ignored.
struct Box: Codable {
    let id: String
    let box: [Int]
}

if CommandLine.arguments.count != 4 {
    fputs("usage: swift ocr/reocr.swift <image.png> <nodes.json> <reocr.json>\n", stderr)
    exit(2)
}

let chartPath = CommandLine.arguments[1]
let nodesPath = CommandLine.arguments[2]
let outPath = CommandLine.arguments[3]

let nodes = try JSONDecoder().decode([Box].self, from: Data(contentsOf: URL(fileURLWithPath: nodesPath)))
guard let image = NSImage(contentsOfFile: chartPath) else { exit(1) }
var rect = NSRect(origin: .zero, size: image.size)
guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { exit(1) }
let height = cg.height

struct Line: Codable {
    let text: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let conf: Float
}
struct Result: Codable {
    let id: String
    let lines: [Line]
}

let sem = DispatchSemaphore(value: 6)
let group = DispatchGroup()
let lock = NSLock()
var results: [Result] = []

for node in nodes {
    let x0 = max(0, node.box[0] - 2)
    let y0 = max(0, node.box[1] - 2)
    let x1 = min(cg.width, node.box[2] + 2)
    let y1 = min(cg.height, node.box[3] + 2)
    let tw = x1 - x0
    let th = y1 - y0
    if tw < 8 || th < 8 { continue }
    sem.wait()
    group.enter()
    DispatchQueue.global().async {
        defer { sem.signal(); group.leave() }
        guard let crop = cg.cropping(to: CGRect(x: x0, y: y0, width: tw, height: th)) else { return }
        // Scale 3x so small italic titles read cleanly.
        let scaledW = tw * 3
        let scaledH = th * 3
        guard let color = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(
                data: nil, width: scaledW, height: scaledH,
                bitsPerComponent: 8, bytesPerRow: 0, space: color,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else { return }
        ctx.interpolationQuality = .high
        ctx.draw(crop, in: CGRect(x: 0, y: 0, width: scaledW, height: scaledH))
        guard let scaled = ctx.makeImage() else { return }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]
        let handler = VNImageRequestHandler(cgImage: scaled, options: [:])
        do { try handler.perform([request]) } catch { return }
        var lines: [Line] = []
        for obs in request.results ?? [] {
            guard let cand = obs.topCandidates(1).first else { continue }
            let b = obs.boundingBox
            let absX = Double(x0) + b.origin.x * Double(tw)
            let absY = Double(y0) + (1 - b.origin.y - b.size.height) * Double(th)
            lines.append(Line(
                text: cand.string,
                x: absX, y: absY,
                w: b.size.width * Double(tw),
                h: b.size.height * Double(th),
                conf: cand.confidence
            ))
        }
        lock.lock()
        results.append(Result(id: node.id, lines: lines))
        lock.unlock()
    }
}
group.wait()
let data = try JSONEncoder().encode(results)
let outputURL = URL(fileURLWithPath: outPath)
try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)
try data.write(to: outputURL)
fputs("reocr \(results.count)\n", stderr)
