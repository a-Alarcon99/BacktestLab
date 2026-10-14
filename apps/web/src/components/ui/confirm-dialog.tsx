"use client"

import { Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

/**
 * Confirmation pop-up for destructive actions. Same anatomy as the replay pop-up: icon badge +
 * title/description + close in the header, actions in a bordered footer.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Eliminar",
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(28rem,calc(100vw-1.5rem))]">
        <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-down-soft text-down">
            <Trash2Icon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <DialogTitle className="text-title font-bold">{title}</DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground">{description}</DialogDescription>
          </div>
          <DialogClose />
        </header>
        <footer className="flex flex-col-reverse gap-2 px-4 py-3 sm:flex-row sm:justify-end md:px-5">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="lg"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog }
