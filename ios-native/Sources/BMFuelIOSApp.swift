import SwiftUI
import WebKit

@main struct BMFuelIOSApp: App {
    var body: some Scene { WindowGroup { NativeFuelView() } }
}

struct NativeFuelView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> NativeFuelController { NativeFuelController() }
    func updateUIViewController(_ uiViewController: NativeFuelController, context: Context) { }
}

final class NativeFuelController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private let url = URL(string: "https://script.google.com/macros/s/AKfycbyyebQBgsCyX0BwYCH8Vls9KHb08tTRXKOWT1j2R38KadQqpaUIraXBOyMqFHeHHwbk/exec")!
    private var main: WKWebView!
    private var popup: WKWebView?
    private var overlay: UIView?
    private var loading: UIProgressView?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.03, green: 0.10, blue: 0.18, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        main = WKWebView(frame: .zero, configuration: configuration)
        main.uiDelegate = self
        main.navigationDelegate = self
        main.allowsBackForwardNavigationGestures = true
        main.isOpaque = false
        main.backgroundColor = view.backgroundColor
        main.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(main)
        NSLayoutConstraint.activate([
            main.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            main.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            main.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            main.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        main.load(URLRequest(url: url))
    }

    private func permitted(_ url: URL) -> Bool {
        if url.scheme == "about" || url.scheme == "blob" { return true }
        guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
        return host == "script.google.com"
            || host == "script.googleusercontent.com"
            || host.hasSuffix(".script.googleusercontent.com")
            || host == "sounalinz5-maker.github.io"
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let target = navigationAction.request.url else {
            decisionHandler(.cancel); return
        }
        if permitted(target) {
            decisionHandler(.allow)
        } else {
            // Google OAuth cannot run inside WKWebView; open externally in Safari.
            // Safari cookies do not automatically transfer back to this WKWebView.
            if target.scheme == "https" || target.scheme == "http" { UIApplication.shared.open(target) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard navigationAction.targetFrame == nil, popup == nil else { return nil }
        let child = WKWebView(frame: .zero, configuration: configuration)
        child.uiDelegate = self
        child.navigationDelegate = self
        child.isOpaque = false
        child.backgroundColor = view.backgroundColor
        child.translatesAutoresizingMaskIntoConstraints = false
        let panel = UIView()
        panel.backgroundColor = view.backgroundColor
        panel.translatesAutoresizingMaskIntoConstraints = false
        let close = UIButton(type: .system)
        close.setTitle("‹ กลับไป BM FUEL", for: .normal)
        close.setTitleColor(.white, for: .normal)
        close.backgroundColor = UIColor(red: 0.09, green: 0.21, blue: 0.36, alpha: 1)
        close.addTarget(self, action: #selector(closePopup), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(panel)
        panel.addSubview(close)
        panel.addSubview(child)
        NSLayoutConstraint.activate([
            panel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            panel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            panel.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            panel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            close.topAnchor.constraint(equalTo: panel.topAnchor),
            close.leadingAnchor.constraint(equalTo: panel.leadingAnchor),
            close.trailingAnchor.constraint(equalTo: panel.trailingAnchor),
            close.heightAnchor.constraint(equalToConstant: 52),
            child.topAnchor.constraint(equalTo: close.bottomAnchor),
            child.leadingAnchor.constraint(equalTo: panel.leadingAnchor),
            child.trailingAnchor.constraint(equalTo: panel.trailingAnchor),
            child.bottomAnchor.constraint(equalTo: panel.bottomAnchor)
        ])
        popup = child
        overlay = panel
        return child
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === popup { closePopup() }
    }

    @objc private func closePopup() {
        popup?.stopLoading()
        popup?.navigationDelegate = nil
        popup?.uiDelegate = nil
        overlay?.removeFromSuperview()
        popup = nil
        overlay = nil
    }

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let host = origin.host.lowercased()
        let trustedOrigin = origin.protocol == "https" &&
            (host == "script.google.com" ||
             host == "script.googleusercontent.com" ||
             host.hasSuffix(".script.googleusercontent.com") ||
             host == "sounalinz5-maker.github.io")
        decisionHandler(trustedOrigin ? .prompt : .deny)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        let alert = UIAlertController(title: "เปิด BM FUEL ไม่สำเร็จ",
          message: "ตรวจสอบอินเทอร์เน็ตและสิทธิ์ Google Apps Script", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "ลองใหม่", style: .default) { [weak self] _ in
          guard let self else { return }
          self.main.load(URLRequest(url: self.url))
        })
        alert.addAction(UIAlertAction(title: "เปิดใน Safari", style: .cancel) { [weak self] _ in
          if let url = self?.url { UIApplication.shared.open(url) }
        })
        present(alert, animated: true)
    }
}
