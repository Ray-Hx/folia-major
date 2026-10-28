import Capacitor
import UIKit

// Capacitor hosts bundled Folia assets edge to edge; CSS insets controls while backgrounds fill the screen.
class FoliaViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FoliaNativePlugin())
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.scrollView.bounces = false
        webView?.allowsBackForwardNavigationGestures = false
    }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}

// CAPBridgeViewController uses WKWebView itself as its root view. A parent controller must own
// layout constraints; changing the bridge root's frame during layout recursively shrinks it.
class FoliaHostViewController: UIViewController {
    private let folia = FoliaViewController()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 9/255, green: 9/255, blue: 11/255, alpha: 1)
        addChild(folia)
        view.addSubview(folia.view)
        folia.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            folia.view.topAnchor.constraint(equalTo: view.topAnchor),
            folia.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            folia.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            folia.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        folia.didMove(toParent: self)
    }
    override var childForStatusBarStyle: UIViewController? { folia }
}

// Native EDR glow follows active lyric bounds; it never intercepts WebView or player touches.
final class LyricHDRView: UIView {
    private var glows: [CAGradientLayer] = []
    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        isOpaque = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    @available(iOS 26.0, *) func update(regions: [[String: Double]], availableHeadroom: CGFloat? = nil) {
        let screen = window?.windowScene?.screen
        let headroom = availableHeadroom ?? screen?.currentEDRHeadroom ?? 1
        let allowed = headroom > 1.05 && !ProcessInfo.processInfo.isLowPowerModeEnabled
        let visible = allowed ? Array(regions.prefix(4)) : []
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        while glows.count < visible.count {
            let glow = CAGradientLayer()
            glow.type = .radial
            glow.startPoint = CGPoint(x: 0.5, y: 0.5)
            glow.endPoint = CGPoint(x: 1, y: 1)
            glow.preferredDynamicRange = .high
            layer.addSublayer(glow)
            glows.append(glow)
        }
        for (index, glow) in glows.enumerated() {
            guard index < visible.count else { glow.isHidden = true; continue }
            let rect = visible[index]
            guard let x = rect["x"], let y = rect["y"], let width = rect["width"], let height = rect["height"],
                  x.isFinite, y.isFinite, width.isFinite, height.isFinite, width > 0, height > 0 else { glow.isHidden = true; continue }
            let bounds = CGRect(x: x, y: y, width: width, height: height).insetBy(dx: -12, dy: -8).intersection(self.bounds)
            guard !bounds.isNull, !bounds.isEmpty else { glow.isHidden = true; continue }
            glow.frame = bounds
            let white = UIColor(red: 1, green: 1, blue: 1, alpha: 0.42, linearExposure: min(3, headroom))
            glow.colors = [white.cgColor, white.withAlphaComponent(0).cgColor]
            glow.locations = [0, 1]
            glow.isHidden = false
        }
        isHidden = visible.isEmpty
        CATransaction.commit()
    }
}
