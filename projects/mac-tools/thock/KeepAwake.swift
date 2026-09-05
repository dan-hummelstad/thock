import Combine
import IOKit.pwr_mgt
import SwiftUI

/// Caffeinate/Amphetamine-style keep-awake: one IOPM assertion while on. Not persisted across
/// launches on purpose (a forgotten keep-awake is a drained battery); the kernel drops the
/// assertion when the process exits, so there's nothing to clean up on quit.
final class KeepAwake: ObservableObject {
    static let shared = KeepAwake()
    @Published private(set) var isOn = false
    private var assertion: IOPMAssertionID = 0

    func set(_ on: Bool) {
        guard on != isOn else { return }
        if on {
            // PreventUserIdleDisplaySleep keeps both the display and the system awake (caffeinate -d).
            let r = IOPMAssertionCreateWithName(kIOPMAssertPreventUserIdleDisplaySleep as CFString,
                                                IOPMAssertionLevel(kIOPMAssertionLevelOn),
                                                "Thock Keep Awake" as CFString, &assertion)
            isOn = r == kIOReturnSuccess
            if !isOn { NSLog("Thock: keep-awake assertion failed (\(r))") }
        } else {
            IOPMAssertionRelease(assertion)
            assertion = 0
            isOn = false
        }
    }
}
