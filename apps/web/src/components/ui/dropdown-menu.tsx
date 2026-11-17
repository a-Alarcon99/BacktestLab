"use client"

import { Menu } from "@base-ui/react/menu"
import { CheckIcon } from "lucide-react"
import { cn } from "cn"

const DropdownMenu = Menu.Root
const DropdownMenuTrigger = Menu.Trigger
const DropdownMenuRadioGroup = Menu.RadioGroup

/** Floating list under its trigger (portaled, so the sticky header's blur never clips it). */
function DropdownMenuContent({
  className,
  align = "end",
  children,
  ...props
}: Menu.Popup.Props & { align?: "start" | "center" | "end" }) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={6} className="z-[60] outline-none">
        <Menu.Popup
          className={cn(
            "min-w-40 origin-(--transform-origin) rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

const itemClass =
  "flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-semibold outline-none select-none data-highlighted:bg-muted"

function DropdownMenuItem({ className, ...props }: Menu.Item.Props) {
  return <Menu.Item className={cn(itemClass, className)} {...props} />
}

/** Radio option: the chosen one carries a check mark. */
function DropdownMenuRadioItem({ className, children, ...props }: Menu.RadioItem.Props) {
  return (
    <Menu.RadioItem className={cn(itemClass, className)} {...props}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Menu.RadioItemIndicator>
          <CheckIcon className="size-4 text-primary" />
        </Menu.RadioItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  )
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger }
