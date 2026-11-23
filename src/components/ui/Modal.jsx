// Usage:
//   <Modal
//     open={isOpen}
//     title="إضافة فرع"
//     onClose={() => setIsOpen(false)}
//     footer={<><Button onClick={save}>حفظ</Button><Button variant="secondary" onClick={close}>إلغاء</Button></>}
//   >
//     ...form fields...
//   </Modal>
import { useEffect } from "react";
import { X } from "lucide-react";

function Modal({ open, title, onClose, children, footer, size = "md" }) {
  // Close with the Escape key.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = size === "lg" ? "max-w-2xl" : size === "sm" ? "max-w-sm" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className={`flex max-h-[90vh] w-full flex-col rounded-lg border border-slate-200 bg-white shadow-lg ${widthClass}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export default Modal;
