import CoreGraphics
import CoreImage
import Foundation

// Generate the small PQ-encoded HDR texture used by the experimental iOS lyric highlight.
let output = URL(fileURLWithPath: "src/components/ios/hdr/lyricHighlight.png")
let linear = CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!
let pq = CGColorSpace(name: CGColorSpace.itur_2100_PQ)!
let white = CIColor(red: 2, green: 2, blue: 2, alpha: 1, colorSpace: linear)!
let image = CIImage(color: white).cropped(to: CGRect(x: 0, y: 0, width: 16, height: 16)).settingContentHeadroom(2)
try CIContext().writePNGRepresentation(of: image, to: output, format: .RGBA16, colorSpace: pq, options: [:])
