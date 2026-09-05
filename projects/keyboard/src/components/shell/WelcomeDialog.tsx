import { SquarePlay, Usb } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface WelcomeDialogProps {
  connecting: boolean
  error?: string
  onDemo: () => void
  onConnect: () => void
}

export function WelcomeDialog({ connecting, error, onDemo, onConnect }: WelcomeDialogProps) {
  const hidAvailable = typeof navigator !== "undefined" && "hid" in navigator

  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <img src="/favicon.svg" alt="" className="mb-2 size-14 rounded-2xl" />
          <DialogTitle>Welcome to thock/keyboard</DialogTitle>
          <DialogDescription>
            Configure actuation, rapid trigger, RGB, remapping and macros for the Womier SK75 TMR — right from your
            browser, over WebHID.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-2">
          <Button onClick={onDemo} disabled={connecting}>
            <SquarePlay /> Try the demo
          </Button>
          <Button variant="outline" onClick={onConnect} disabled={connecting || !hidAvailable}>
            <Usb /> Connect keyboard
          </Button>
          {!hidAvailable && (
            <p className="text-xs text-muted-foreground">WebHID isn't available in this browser.</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">Requires Chrome or Edge — WebHID isn't supported elsewhere.</p>
      </DialogContent>
    </Dialog>
  )
}
