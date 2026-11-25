// Usage:
//   <ConfirmDialog
//     open={Boolean(branchToDelete)}
//     message={`هل أنت متأكد من حذف ${branchToDelete?.name}؟`}
//     onConfirm={handleDelete}
//     onCancel={() => setBranchToDelete(null)}
//     loading={deleting}
//   />
// Destructive actions keep the red confirm button (default). A safe action passes confirmVariant="primary".
import Button from "./Button";
import Modal from "./Modal";

function ConfirmDialog({
  open,
  title = "تأكيد الحذف",
  message = "هل أنت متأكد من الحذف؟",
  confirmLabel = "حذف",
  cancelLabel = "إلغاء",
  onConfirm,
  onCancel,
  loading = false,
  confirmVariant = "danger",
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={loading ? () => {} : onCancel}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">{message}</p>
    </Modal>
  );
}

export default ConfirmDialog;
