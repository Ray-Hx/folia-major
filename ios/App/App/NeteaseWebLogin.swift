import UIKit
import WebKit

// NetEase's QR scan opens its web login page in the phone app and that page rejects this
// client as an abnormal environment. This controller signs in on the official mobile web
// page instead (phone number + SMS), then returns the account cookies. The data store is
// non-persistent: the account cookie has one owner, the provider session, not a second
// hidden WebKit copy.
final class NeteaseWebLoginController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    var onFinish: ((String?) -> Void)?

    private let webView: WKWebView
    private let activity = UIActivityIndicatorView(style: .medium)
    private var cookieTimer: Timer?
    private var finished = false

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "登录网易云音乐"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .cancel, target: self, action: #selector(cancel))

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        activity.translatesAutoresizingMaskIntoConstraints = false
        activity.hidesWhenStopped = true
        activity.startAnimating()
        view.addSubview(activity)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            activity.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])

        webView.load(URLRequest(url: URL(string: "https://music.163.com/login")!))
        // WKHTTPCookieStore has no change notification for HttpOnly account cookies; polling
        // is the only way to learn that the phone/SMS flow finished.
        cookieTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.checkCookies()
        }
    }

    deinit {
        cookieTimer?.invalidate()
    }

    private func checkCookies() {
        guard !finished else { return }
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self, !self.finished else { return }
            let relevant = cookies.filter { $0.domain.contains("163.com") }
            guard relevant.contains(where: { $0.name == "MUSIC_U" && !$0.value.isEmpty }) else { return }
            let cookie = relevant.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
            DispatchQueue.main.async { self.finish(cookie) }
        }
    }

    private func finish(_ cookie: String?) {
        guard !finished else { return }
        finished = true
        cookieTimer?.invalidate()
        cookieTimer = nil
        let callback = onFinish
        onFinish = nil
        dismiss(animated: true) { callback?(cookie) }
    }

    @objc private func cancel() {
        finish(nil)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        activity.startAnimating()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activity.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activity.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activity.stopAnimating()
    }

    // The web sign-in opens its captcha and help pages in new windows; keep them in this one.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}
