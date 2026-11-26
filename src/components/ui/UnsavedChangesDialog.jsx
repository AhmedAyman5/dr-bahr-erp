// The question shown when the user leaves a full-page form with unsaved changes (hooks/useUnsavedChanges).
// Usage:
//   const guard = useUnsavedChanges(isDirty);
//   <UnsavedChangesDialog guard={guard} />
// Red "تجاهل التغييرات" = leave without saving; "البقاء في الصفحة" (also X / Escape) = stay, the data is kept.
import ConfirmDialog from "./ConfirmDialog";

function UnsavedChangesDialog({ guard }) {
  return (
    <ConfirmDialog
      open={guard.blocked}
      title="تجاهل التغييرات"
      message="لديك تغييرات غير محفوظة. هل تريد مغادرة الصفحة بدون حفظ؟"
      confirmLabel="تجاهل التغييرات"
      cancelLabel="البقاء في الصفحة"
      onConfirm={guard.leave}
      onCancel={guard.stay}
    />
  );
}

export default UnsavedChangesDialog;
