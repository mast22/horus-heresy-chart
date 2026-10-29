import AppKit
import Foundation
import Vision

// Tiled Vision OCR. CGImage crops use a top-left origin. See ocr/README.md.
if CommandLine.arguments.count != 3 {
    fputs("usage: swift ocr/ocr.swift <image.png> <ocr.json>\n", stderr)
    exit(2)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let tileSize = 2200
let overlap = 280

guard let image = NSImage(contentsOfFile: inputPath) else {
    fputs("failed to load image\n", stderr)
    exit(1)
}

var rect = NSRect(origin: .zero, size: image.size)
guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    fputs("failed to make cgimage\n", stderr)
    exit(1)
}

let width = cg.width
let height = cg.height
fputs("image \(width)x\(height)\n", stderr)

struct Hit: Codable {
    let text: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let conf: Float
}

var hits: [Hit] = []
let lock = NSLock()
let group = DispatchGroup()
let queue = DispatchQueue(label: "ocr", attributes: .concurrent)
let sem = DispatchSemaphore(value: 4)

var y0 = 0
while y0 < height {
    var x0 = 0
    let tileH = min(tileSize, height - y0)
    while x0 < width {
        let tileW = min(tileSize, width - x0)
        let ox = x0
        let oy = y0
        let tw = tileW
        let th = tileH
        sem.wait()
        group.enter()
        queue.async {
            defer {
                sem.signal()
                group.leave()
            }
            // CGImage crop origin is the top-left of the pixel buffer.
            guard let crop = cg.cropping(to: CGRect(x: ox, y: oy, width: tw, height: th)) else {
                return
            }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]
            let handler = VNImageRequestHandler(cgImage: crop, options: [:])
            do {
                try handler.perform([request])
            } catch {
                fputs("ocr error \(error)\n", stderr)
                return
            }
            let observations = request.results ?? []
            var local: [Hit] = []
            for obs in observations {
                guard let candidate = obs.topCandidates(1).first else { continue }
                let box = obs.boundingBox
                // Vision box is normalized, origin bottom-left of the tile.
                let absX = Double(ox) + box.origin.x * Double(tw)
                let absYTop = Double(oy) + (1.0 - box.origin.y - box.size.height) * Double(th)
                let absW = box.size.width * Double(tw)
                let absH = box.size.height * Double(th)
                local.append(Hit(text: candidate.string, x: absX, y: absYTop, w: absW, h: absH, conf: candidate.confidence))
            }
            lock.lock()
            hits.append(contentsOf: local)
            lock.unlock()
            fputs("tile \(ox),\(oy) hits \(local.count)\n", stderr)
        }
        x0 += tileSize - overlap
    }
    y0 += tileSize - overlap
}

group.wait()

// Deduplicate overlapping tile hits: same text with centers within 40px.
struct Key: Hashable {
    let text: String
    let gx: Int
    let gy: Int
}

var best: [Key: Hit] = [:]
for hit in hits {
    let cx = hit.x + hit.w / 2
    let cy = hit.y + hit.h / 2
    let key = Key(text: hit.text, gx: Int(cx / 30), gy: Int(cy / 18))
    if let existing = best[key] {
        if hit.conf > existing.conf {
            best[key] = hit
        }
    } else {
        best[key] = hit
    }
}

let unique = best.values.sorted { a, b in
    if abs(a.y - b.y) > 12 { return a.y < b.y }
    return a.x < b.x
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(unique)
let outputURL = URL(fileURLWithPath: outputPath)
try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)
try data.write(to: outputURL)
fputs("wrote \(unique.count) hits\n", stderr)
