// The action buttons of a document's details page (إرسال، قبول، ترحيل، إلغاء، حذف، تعديل ...).
// The PAGE decides which actions the current status allows (the state machines in week2flow §6) and passes
// only those. Presentational: never calls the API itself.
//
// Usage:
//   <DocumentActions
//     actions={[
//       { key: "edit", label: "تعديل", icon: Pencil, variant: "secondary", to: `/purchase-quotations/${id}/edit` },
//       {
//         key: "send", label: "إرسال", icon: Send, variant: "primary",
//         onClick: () => changeStatus("SENT"),          // may return a promise
//         confirm: { title: "إرسال العرض", message: "...", confirmLabel: "إرسال العرض", confirmVariant: "primary" },
//       },
//     ]}
//   />
// - to:      a link (opens another page) — no confirmation.
// - onClick: with `confirm` it runs after the ConfirmDialog (confirmVariant default "danger" = red;
//   confirm.cancelLabel default "إلغاء", e.g. "رجوع" when the action itself is called "إلغاء الفاتورة").
//   While a returned promise runs, EVERY button is disabled (links too) and the dialog's button shows loading;
//   the dialog closes when it ends. The page catches and shows its own errors (onClick should not throw).
// - disabled + title: the button stays visible but can't be used; `title` says why (a tooltip on a wrapper,
//   because a disabled button shows no tooltip in every browser), e.g. "عليها مرتجع مُرحّل، ألغِ المرتجع أولًا".
import { useState } from "react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";

function DocumentActions({ actions }) {
  const [runningKey, setRunningKey] = useState(null);
  const [pending, setPending] = useState(null); // the action waiting for its confirmation
  const busy = runningKey !== null;

  async function run(action) {
    setRunningKey(action.key);
    try {
      await action.onClick();
    } finally {
      setRunningKey(null);
      setPending(null);
    }
  }

  function handleClick(action) {
    if (action.confirm) setPending(action);
    else run(action);
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        const content = (
          <>
            {Icon && <Icon size={16} />}
            {action.label}
          </>
        );
        if (action.disabled) {
          return (
            <span key={action.key} title={action.title}>
              <Button variant={action.variant} disabled>
                {content}
              </Button>
            </span>
          );
        }
        // A link can't be disabled: while an action runs it becomes a disabled button.
        if (action.to && !busy) {
          return (
            <Button key={action.key} variant={action.variant} to={action.to}>
              {content}
            </Button>
          );
        }
        return (
          <Button
            key={action.key}
            variant={action.variant}
            disabled={busy}
            loading={runningKey === action.key && !action.confirm}
            onClick={() => handleClick(action)}
          >
            {content}
          </Button>
        );
      })}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.confirm.title}
        message={pending?.confirm.message}
        confirmLabel={pending?.confirm.confirmLabel}
        confirmVariant={pending?.confirm.confirmVariant ?? "danger"}
        cancelLabel={pending?.confirm.cancelLabel ?? "إلغاء"}
        onConfirm={() => run(pending)}
        onCancel={() => setPending(null)}
        loading={busy}
      />
    </div>
  );
}

export default DocumentActions;
