import AppKit
import SwiftUI
import IOKit.hid

// Pointer acceleration off + sensitivity via IOHID service properties. See MOUSE.md › Worker B.
// `apply()` runs at launch (ThockApp.swift), `restore()` at quit.
//
// Mechanism (Apple's IOHIDPointerScrollFilter.cpp, setupPointerAcceleration): with
// HIDUseLinearScalingMouseAcceleration = 1 the filter builds IOHIDSimpleAccelerator(trackingValue)
// and never reads HIDPointerResolution — so sensitivity is the *tracking value* (the key named by
// HIDPointerAccelerationType, normally "HIDMouseAcceleration"; IOFixed 0…3.0, system default
// 0.6875). With linear scaling off the same value picks the acceleration curve, exactly like the
// System Settings › Mouse › Tracking speed slider. One knob, both modes, no resolution writes.
enum MousePointer {
    static func apply() {
        guard let client = client() else { NSLog("Thock: pointer — IOHID client unavailable, skipping"); return }
        guard let copyServices = HIDPointerSPI.copyServices,
              let services = copyServices(client)?.takeRetainedValue() as? [CFTypeRef]
        else { NSLog("Thock: pointer — no HID mouse services found"); return }
        NSLog("Thock: pointer — \(services.count) matching HID service(s), applying")
        for svc in services { applyOne(svc) }   // a loop, not forEach(applyOne): the method-to-closure conversion drops MainActor isolation and warns
    }

    static func restore() {
        guard let setProp = HIDPointerSPI.serviceSetProperty, !originals.isEmpty else { return }
        for (_, o) in originals {
            // Services usually report no linear flag of their own pre-Thock; fall back to the
            // system-level value so quitting leaves the mouse on the System Settings choice.
            if let linear = o.linear ?? systemValue(for: kLinearKey), !setProp(o.service, kLinearKey, linear).boolValue {
                NSLog("Thock: pointer — restore linear-scaling write rejected")
            }
            if let tracking = o.tracking ?? systemValue(for: o.trackingKey), !setProp(o.service, o.trackingKey, tracking).boolValue {
                NSLog("Thock: pointer — restore tracking write rejected")
            }
        }
        NSLog("Thock: pointer — restored \(originals.count) service(s) to their original settings")
        originals.removeAll()
    }

    /// Pure-logic asserts, run from `runSelfTestIfRequested()`.
    static func selfTest() {
        assert(tracking(forStep: 20) == 3.0, "top step = the system slider's 3.0 ceiling")
        assert(tracking(forStep: 5) == 0.75, "default step ≈ the 0.6875 system default")
        assert(tracking(forStep: 0) == 0.15 && tracking(forStep: 99) == 3.0, "steps clamp to 1…20")
        assert(ioFixed(0.75) == 49_152 && ioFixed(0.6875) == 45_056, "IOFixed 16.16 encoding")
    }

    // MARK: - Pure logic

    /// 20 steps spanning the system tracking range (0.15…3.0); step 5 (0.75) is nearest the
    /// 0.6875 default. ponytail: linear grid — the filter's multiplier is linear in this value
    /// too, so step N is N× the speed of step 1. Upgrade: a log grid if the low end feels coarse.
    static func tracking(forStep step: Int) -> Double { Double(min(max(step, 1), 20)) * 0.15 }

    /// IOFixed is 16.16 fixed-point.
    static func ioFixed(_ v: Double) -> Int32 { Int32((v * 65536.0).rounded()) }

    // MARK: - Apply/restore machinery

    private static let kLinearKey = "HIDUseLinearScalingMouseAcceleration" as CFString
    private static let kAccelTypeKey = "HIDPointerAccelerationType" as CFString
    private static let kBuiltInKey = "Built-In" as CFString
    private static let kProductKey = "Product" as CFString

    private struct Original { let service: CFTypeRef; let trackingKey: CFString; let tracking: CFTypeRef?; let linear: CFTypeRef? }
    // ponytail: keyed by service identity, not by a "RegistryID" property — verified on this
    // machine that IOHIDServiceClient doesn't expose one (only IOHIDDevice/IORegistryEntry do).
    // Betting that IOHIDEventSystemClientCopyServices hands back the same cached object (same
    // pointer) for the same physical device across calls — held on this machine across repeated
    // CopyServices calls, even after the previous CFArray was released. Ceiling: unspecified by
    // Apple. Upgrade: dlsym IOHIDServiceClientGetRegistryID (returns a stable UInt64) and key by
    // that instead, if a future OS breaks the identity assumption.
    private static var originals: [ObjectIdentifier: Original] = [:]
    private static var hidClient: CFTypeRef?
    private static var matchBlock: HIDPointerSPI.ServiceBlock?   // retained: the SPI doesn't retain the block itself
    private static var lastApplied: (Bool, Int)?   // dedups the "applied ..." log across services/slider ticks

    private static func client() -> CFTypeRef? {
        if let hidClient { return hidClient }
        guard let create = HIDPointerSPI.create, let setMatching = HIDPointerSPI.setMatching,
              let schedule = HIDPointerSPI.schedule, let registerBlock = HIDPointerSPI.registerMatchingBlock,
              let c = create(kCFAllocatorDefault)?.takeRetainedValue()
        else { return nil }
        let matching: [String: Any] = [kIOHIDDeviceUsagePageKey: kHIDPage_GenericDesktop,
                                        kIOHIDDeviceUsageKey: kHIDUsage_GD_Mouse]
        setMatching(c, matching as CFDictionary)
        // Hot-plug: re-apply to newly matched services as they appear.
        let block: HIDPointerSPI.ServiceBlock = { _, _, svc in
            NSLog("Thock: pointer — new matching HID service, applying")
            applyOne(svc)
        }
        matchBlock = block
        registerBlock(c, block, nil, nil)
        schedule(c, DispatchQueue.main)
        hidClient = c
        return c
    }

    private static func applyOne(_ svc: CFTypeRef) {
        guard let copyProp = HIDPointerSPI.serviceCopyProperty, let setProp = HIDPointerSPI.serviceSetProperty
        else { return }
        // The built-in trackpad also matches GenericDesktop/Mouse — never touch it.
        if (copyProp(svc, kBuiltInKey)?.takeRetainedValue() as? NSNumber)?.boolValue == true { return }
        // ponytail: an external Magic Trackpad isn't Built-In but names the trackpad curve — skip it too;
        // only mice get tracking/linear-scaling writes. Upgrade: match on usage / product class.
        let accelType = copyProp(svc, kAccelTypeKey)?.takeRetainedValue() as? String
        if accelType == "HIDTrackpadAcceleration" { return }
        let trackingKey = (accelType ?? "HIDMouseAcceleration") as CFString

        let key = ObjectIdentifier(svc)
        if originals[key] == nil {
            let tracking = copyProp(svc, trackingKey)?.takeRetainedValue()
            let linear = copyProp(svc, kLinearKey)?.takeRetainedValue()
            originals[key] = Original(service: svc, trackingKey: trackingKey, tracking: tracking, linear: linear)
            let product = (copyProp(svc, kProductKey)?.takeRetainedValue() as? String) ?? "unknown mouse"
            NSLog("Thock: pointer — tracking \"\(product)\" (original \(trackingKey)=\(String(describing: tracking)) linear=\(String(describing: linear)))")
        }

        let disable = Prefs.disableAcceleration
        let step = Prefs.sensitivityStep
        // When the user leaves acceleration on, don't stomp a system-level "off" they set
        // themselves in System Settings — mirror it back instead of hard-writing 0.
        let linearValue: CFTypeRef = disable ? NSNumber(value: 1) : (systemValue(for: kLinearKey) ?? NSNumber(value: 0))
        if !setProp(svc, kLinearKey, linearValue).boolValue {
            NSLog("Thock: pointer — linear-scaling write rejected")
        }
        // Writing the tracking value is also what makes the filter rebuild its accelerator, so
        // it must come after the linear flag.
        if !setProp(svc, trackingKey, NSNumber(value: ioFixed(tracking(forStep: step)))).boolValue {
            NSLog("Thock: pointer — tracking write rejected")
        }

        if lastApplied?.0 != disable || lastApplied?.1 != step {
            NSLog("Thock: pointer — applied disableAcceleration=\(disable) sensitivity=\(step)/20 (\(trackingKey)=\(tracking(forStep: step)))")
            lastApplied = (disable, step)
        }
    }

    /// The system-level value IOHIDEventSystemClient reports for `key` (nil if there's no client yet).
    private static func systemValue(for key: CFString) -> CFTypeRef? {
        guard let client = hidClient, let clientCopyProp = HIDPointerSPI.clientCopyProperty else { return nil }
        return clientCopyProp(client, key)?.takeRetainedValue()
    }
}

extension Prefs {
    // ponytail: literal fallbacks read straight from UserDefaults — Prefs.register() is shared
    // scaffolding owned by ThockApp.swift, not touched here (see MOUSE.md).
    static var disableAcceleration: Bool {
        UserDefaults.standard.object(forKey: "disableAcceleration") == nil
            ? true : UserDefaults.standard.bool(forKey: "disableAcceleration")
    }
    /// 1…20; a new key (the old "sensitivity" Double was a resolution factor, which linear mode ignores).
    static var sensitivityStep: Int {
        min(max(UserDefaults.standard.object(forKey: "sensitivityStep") as? Int ?? 5, 1), 20)
    }
}

// Private IOHIDEventSystemClient/IOHIDServiceClient SPI, resolved at runtime via dlsym so the
// build needs no linker flags — same shape as WindowManager's SkyLight block. This is the route
// LinearMouse uses for the same feature (see MOUSE.md); Apple could rename any of these.
// ponytail: private symbols; if any fail to resolve, `client()` returns nil and apply()/restore()
// are no-ops (logged once) rather than crashing.
private enum HIDPointerSPI {
    static let handle = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_LAZY)
    static func sym<T>(_ name: String, _ t: T.Type) -> T? {
        guard let handle, let p = dlsym(handle, name) else { return nil }
        return unsafeBitCast(p, to: T.self)
    }
    typealias CreateFn = @convention(c) (CFAllocator?) -> Unmanaged<CFTypeRef>?
    typealias SetMatchingFn = @convention(c) (CFTypeRef, CFDictionary) -> Void
    typealias CopyServicesFn = @convention(c) (CFTypeRef) -> Unmanaged<CFArray>?
    typealias ClientCopyPropertyFn = @convention(c) (CFTypeRef, CFString) -> Unmanaged<CFTypeRef>?
    typealias ServiceBlock = @convention(block) (UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, CFTypeRef) -> Void
    typealias RegisterMatchingBlockFn = @convention(c) (CFTypeRef, ServiceBlock, UnsafeMutableRawPointer?, UnsafeMutableRawPointer?) -> Void
    typealias ScheduleFn = @convention(c) (CFTypeRef, DispatchQueue) -> Void
    typealias ServiceCopyPropertyFn = @convention(c) (CFTypeRef, CFString) -> Unmanaged<CFTypeRef>?
    typealias ServiceSetPropertyFn = @convention(c) (CFTypeRef, CFString, CFTypeRef) -> DarwinBoolean   // C `Boolean` = unsigned char

    static let create = sym("IOHIDEventSystemClientCreate", CreateFn.self)
    static let setMatching = sym("IOHIDEventSystemClientSetMatching", SetMatchingFn.self)
    static let copyServices = sym("IOHIDEventSystemClientCopyServices", CopyServicesFn.self)
    static let clientCopyProperty = sym("IOHIDEventSystemClientCopyProperty", ClientCopyPropertyFn.self)
    static let registerMatchingBlock = sym("IOHIDEventSystemClientRegisterDeviceMatchingBlock", RegisterMatchingBlockFn.self)
    static let schedule = sym("IOHIDEventSystemClientScheduleWithDispatchQueue", ScheduleFn.self)
    static let serviceCopyProperty = sym("IOHIDServiceClientCopyProperty", ServiceCopyPropertyFn.self)
    static let serviceSetProperty = sym("IOHIDServiceClientSetProperty", ServiceSetPropertyFn.self)
}

/// "Mouse › Pointer" card (hosted by SettingsView.detail). Own @AppStorage here — extensions can't add stored properties.
struct PointerPane: View {
    @AppStorage("disableAcceleration") private var disableAcceleration = true
    @AppStorage("sensitivityStep") private var sensitivityStep = 5

    var body: some View {
        group("Pointer",
              footer: "External mice only (the built-in trackpad is untouched). Acceleration off makes pointer travel proportional to hand movement; sensitivity is the tracking speed on a 20-step scale (5 ≈ the macOS default). Restored when Thock quits.") {
            row("Disable acceleration") {
                switchToggle(disableAcceleration).onTapGesture { disableAcceleration.toggle() }
            }
            Divider().overlay(Theme.stroke)
            row("Sensitivity") {
                sliderRow(Binding(get: { Double(sensitivityStep) }, set: { sensitivityStep = Int($0) }),
                          in: 1...20, step: 1, unit: "/ 20")
            }
        }
        .onChange(of: disableAcceleration) { _, _ in MousePointer.apply() }
        .onChange(of: sensitivityStep) { _, _ in MousePointer.apply() }
    }
}
