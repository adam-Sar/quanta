import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Optional label for screen readers when no `title` is provided. */
  ariaLabel?: string;
}

/* Returns the tabbable elements inside `root`, in DOM order. */
function getTabbable(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null,
  );
}

const FOCUSABLE_INERT = "main, [data-modal-inert]";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  ariaLabel,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remember what had focus so we can restore it on close (a11y best
    // practice for non-redirecting modals).
    lastFocusedRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const tabbable = getTabbable(dialogRef.current);
        if (tabbable.length === 0) return;
        const first = tabbable[0];
        const last = tabbable[tabbable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    // Mark the rest of the app as inert so screen readers and keyboard
    // users can't escape the dialog into the page beneath.
    const inertTargets = document.querySelectorAll<HTMLElement>(FOCUSABLE_INERT);
    inertTargets.forEach((el) => {
      el.setAttribute("data-prev-aria-hidden", el.getAttribute("aria-hidden") ?? "");
      el.setAttribute("aria-hidden", "true");
    });

    // Focus the first tabbable element (or the dialog itself) on open.
    const focusTarget =
      (dialogRef.current && getTabbable(dialogRef.current)[0]) ?? dialogRef.current;
    focusTarget?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      inertTargets.forEach((el) => {
        const prev = el.getAttribute("data-prev-aria-hidden") ?? "";
        if (prev) el.setAttribute("aria-hidden", prev);
        else el.removeAttribute("aria-hidden");
        el.removeAttribute("data-prev-aria-hidden");
      });
      // Restore focus to the element that opened the modal.
      lastFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={cn(
          "card flex max-h-[90vh] w-[92vw] flex-col overflow-hidden outline-none",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg",
          size === "lg" && "max-w-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : ariaLabel}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-ink-500">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Close dialog"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2"
          data-modal-scroll
        >
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}