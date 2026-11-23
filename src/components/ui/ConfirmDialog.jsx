// Usage:
//   <ConfirmDialog
//     open={Boolean(branchToDelete)}
//     message={`هل أنت متأكد من حذف ${branchToDelete?.name}؟`}
//     onConfirm={handleDelete}
//     onCancel={() => setBranchToDelete(null)}
//     loading={deleting}
//   />
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
          <Button variant="danger" onClick={onConfirm} loading={loading}>
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
