import UIKit
import MediaPlayer
import AVKit

// A real UIKit material above the live WebView: Liquid Glass on iOS 26, system material before it.
final class NativePlayerChrome: UIVisualEffectView {
    var onAction: ((String) -> Void)?
    var onSeek: ((Double) -> Void)?
    private let title = UILabel()
    private let subtitle = UILabel()
    private let seek = UISlider()
    private let play = UIButton(type: .system)
    private let previous = UIButton(type: .system)
    private let nextButton = UIButton(type: .system)
    private let more = UIButton(type: .system)
    private let stack = UIStackView()
    private let names = UIStackView()
    private var heightRule: NSLayoutConstraint!
    private var insetRules: [NSLayoutConstraint] = []
    private var duration = 0.0
    private var playing = false
    private var labels: [String: String] = [:]

    init() {
        let material: UIVisualEffect
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect(style: .clear)
            glass.isInteractive = true
            material = glass
        } else { material = UIBlurEffect(style: .systemUltraThinMaterial) }
        super.init(effect: material)
        accessibilityIdentifier = "folia-native-transport"
        layer.cornerRadius = 28
        layer.cornerCurve = .continuous
        clipsToBounds = true
        title.font = .preferredFont(forTextStyle: .subheadline)
        title.adjustsFontForContentSizeCategory = true
        title.lineBreakMode = .byTruncatingTail
        subtitle.font = .preferredFont(forTextStyle: .caption1)
        subtitle.textColor = .secondaryLabel
        subtitle.lineBreakMode = .byTruncatingTail
        subtitle.textAlignment = .right
        names.axis = .horizontal; names.spacing = 8
        names.addArrangedSubview(title); names.addArrangedSubview(subtitle)
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        subtitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let nameHeight = names.heightAnchor.constraint(equalToConstant: 20)
        nameHeight.priority = .defaultHigh; nameHeight.isActive = true
        seek.minimumValue = 0; seek.maximumValue = 1
        seek.addTarget(self, action: #selector(seekChanged), for: .valueChanged)
        seek.addTarget(self, action: #selector(seekFinished), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        seek.heightAnchor.constraint(equalToConstant: 20).isActive = true
        let row = UIStackView(); row.axis = .horizontal; row.distribution = .fillEqually
        configure(previous, symbol: "backward.end.fill", action: "previous")
        configure(play, symbol: "play.fill", action: "toggle")
        configure(nextButton, symbol: "forward.end.fill", action: "next")
        configure(more, symbol: "slider.horizontal.3", action: "panel")
        let route = AVRoutePickerView(); route.accessibilityIdentifier = "folia-route-picker"
        [previous, play, nextButton, more, route].forEach(row.addArrangedSubview)
        row.heightAnchor.constraint(equalToConstant: 44).isActive = true
        stack.axis = .vertical; stack.spacing = 4
        [names, seek, row].forEach(stack.addArrangedSubview)
        contentView.addSubview(stack); stack.translatesAutoresizingMaskIntoConstraints = false
        insetRules = [stack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 6),
                      stack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -6)]
        NSLayoutConstraint.activate(insetRules + [stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16)])
        isHidden = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    private func configure(_ button: UIButton, symbol: String, action: String) {
        button.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .semibold)), for: .normal)
        button.accessibilityIdentifier = "folia-native-" + action
        button.addAction(UIAction { [weak self] _ in self?.onAction?(action) }, for: .touchUpInside)
    }
    func attach(to host: UIView) {
        host.addSubview(self); translatesAutoresizingMaskIntoConstraints = false
        heightRule = heightAnchor.constraint(equalToConstant: 104)
        let preferred = widthAnchor.constraint(equalToConstant: 480); preferred.priority = .defaultHigh
        NSLayoutConstraint.activate([centerXAnchor.constraint(equalTo: host.safeAreaLayoutGuide.centerXAnchor),
            leadingAnchor.constraint(greaterThanOrEqualTo: host.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            trailingAnchor.constraint(lessThanOrEqualTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -8), heightRule, preferred])
    }
    override func layoutSubviews() {
        let compact = (superview?.bounds.height ?? 800) < 500
        if names.isHidden != compact {
            names.isHidden = compact
            stack.spacing = compact ? 0 : 4
            insetRules[0].constant = compact ? 4 : 6
            insetRules[1].constant = compact ? -4 : -6
            heightRule?.constant = compact ? 72 : 104
        }
        super.layoutSubviews()
    }
    func present(_ options: [String: Any]) {
        overrideUserInterfaceStyle = options["light"] as? Bool == true ? .light : .dark
        labels = options["labels"] as? [String: String] ?? [:]
        previous.accessibilityLabel = labels["previous"]
        nextButton.accessibilityLabel = labels["next"]
        more.accessibilityLabel = labels["panel"]
        seek.accessibilityLabel = labels["seek"]
        isHidden = options["shown"] as? Bool != true
        superview?.bringSubviewToFront(self)
        updateAccessibility()
    }
    func update(_ state: [String: Any]) {
        let metadata = MPNowPlayingInfoCenter.default().nowPlayingInfo
        title.text = metadata?[MPMediaItemPropertyTitle] as? String
        subtitle.text = metadata?[MPMediaItemPropertyArtist] as? String
        duration = state["duration"] as? Double ?? 0
        playing = state["playing"] as? Bool == true
        if !seek.isTracking {
            seek.value = duration > 0 ? Float((state["position"] as? Double ?? 0) / duration) : 0
        }
        seek.isEnabled = duration > 0
        let position = state["position"] as? Double ?? 0
        seek.accessibilityValue = String(format: "%d:%02d / %d:%02d", Int(max(0, position)) / 60, Int(max(0, position)) % 60, Int(max(0, duration)) / 60, Int(max(0, duration)) % 60)
        play.setImage(UIImage(systemName: playing ? "pause.fill" : "play.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 21, weight: .semibold)), for: .normal)
        updateAccessibility()
    }
    private func updateAccessibility() { play.accessibilityLabel = labels[playing ? "pause" : "play"] }
    @objc private func seekChanged() { if !seek.isTracking { onSeek?(Double(seek.value) * duration) } }
    @objc private func seekFinished() { onSeek?(Double(seek.value) * duration) }
}
