import Capacitor
import UIKit

// Capacitor hosts bundled Folia assets; UIKit constrains the complete interactive canvas to safe areas.
class FoliaViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FoliaNativePlugin())
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.scrollView.bounces = false
        webView?.allowsBackForwardNavigationGestures = false
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // CSS uses this viewport, so all visualizers measure the usable canvas after rotation.
        webView?.frame = view.safeAreaLayoutGuide.layoutFrame
    }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
