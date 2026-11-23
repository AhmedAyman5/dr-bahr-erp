// Usage (simple dialog):
//   <Modal
//     open={isOpen}
//     title="تفاصيل"
//     onClose={() => setIsOpen(false)}
//     footer={<Button variant="secondary" onClick={() => setIsOpen(false)}>إغلاق</Button>}
//   >
//     ...content...
//   </Modal>
//
// Usage (form with unsaved-changes protection):
//   <Modal
//     open
//     title="إضافة فرع"
//     onClose={onClose}
//     dirty={isDirty}              // true when the user changed something
//     cancelLabel="إلغاء"          // Modal renders the cancel button itself (after the footer)
//     closeDisabled={saving}       // X / إلغاء / Escape do nothing while saving
//     footer={<Button type="submit" form="branch-form">حفظ</Button>}
//   >
//     <form id="branch-form" onSubmit={handleSubmit}>...</form>
//   </Modal>
//
// Closes only with the X button, the cancel button or the Escape key.
// Clicking the dark backdrop does NOT close it, so typed form data is never lost by mistake.
// When `dirty` is true, closing first asks "تجاهل التغييرات" (a small confirm dialog). That is why
// the cancel button should come from `cancelLabel`: then it gets the same check as X / Escape.
import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import Button from "./Button";

function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
  dirty = false,
  cancelLabel,
  closeDisabled = false,
}) {
  const titleId = useId();
  const [discardOpen, setDiscardOpen] = useState(false);

  // X / cancel / Escape all go through here.
  function requestClose() {
    if (closeDisabled) return;
    if (dirty) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  }

  function handleDiscard() {
    setDiscardOpen(false);
    onClose();
  }

  // Close with the Escape key. While the discard dialog is open, Escape belongs to it.
  useEffect(() => {
    if (!open || discardOpen) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") requestClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  if (!open) return null;

  const widthClass = size === "lg" ? "max-w-2xl" : size === "sm" ? "max-w-sm" : "max-w-lg";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div
          className={`flex max-h-[90vh] w-full flex-col rounded-lg border border-slate-200 bg-white shadow-lg ${widthClass}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              disabled={closeDisabled}
              className="rounded-lg p-1 text-slate-500 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
              title="إغلاق"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-4">{children}</div>

          {(footer || cancelLabel) && (
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              {footer}
              {cancelLabel && (
                <Button variant="secondary" onClick={requestClose} disabled={closeDisabled}>
                  {cancelLabel}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unsaved-changes confirmation (same look as ConfirmDialog, which itself uses Modal). */}
      <Modal
        open={discardOpen}
        title="تجاهل التغييرات"
        size="sm"
        onClose={() => setDiscardOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscardOpen(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={handleDiscard}>
              تجاهل التغييرات
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج بدون حفظ؟</p>
      </Modal>
    </>
  );
}

export default Modal;
