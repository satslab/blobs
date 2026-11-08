import { useDragToDismiss } from "./useDragToDismiss";

/**
 * The grab bar of a popover that phones show as a bottom sheet (its sheet carries
 * `data-sheet-drag`). Dragging it down closes the popover the way Escape does.
 */
export function SheetDragHandle() {
  const dragToDismiss = useDragToDismiss((sheet) =>
    (sheet.querySelector("input") ?? sheet).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  return (
    <div
      aria-hidden
      {...dragToDismiss}
      className="absolute inset-x-0 top-0 z-10 hidden h-7 touch-none justify-center pt-2 max-sm:flex"
    >
      <span className="h-1 w-9 rounded-full bg-foreground/20" />
    </div>
  );
}
