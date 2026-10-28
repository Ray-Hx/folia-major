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
