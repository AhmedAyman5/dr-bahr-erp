// Currencies (العملات): purchase currencies + the default currency used to value the stock.
// Same structure as pages/Branches. Docs: ../backend/doc/week2/currency.txt
//
// The default currency (العملة الأساسية): at most one. It has no delete button, and it is changed
// only by making ANOTHER currency the default ("اجعلها أساسية" → the old one loses it by itself).
import { useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import SearchInput from "../../components/ui/SearchInput";
import useAutoHideMessage from "../../hooks/useAutoHideMessage";
import useLoadData from "../../hooks/useLoadData";
import { getErrorMessage } from "../../utils/errors";
import { deleteCurrency, getCurrencies, makeDefaultCurrency } from "./currenciesApi";
import CurrencyFormModal from "./components/CurrencyFormModal";

const COLUMNS = [
  { key: "code", label: "الكود", render: (row) => <span dir="ltr">{row.code}</span> },
  { key: "name", label: "الاسم" },
  { key: "symbol", label: "الرمز", render: (row) => row.symbol || "-" },
  {
    key: "isDefault",
    label: "العملة الأساسية",
    render: (row) =>
      row.isDefault ? (
        <span className="inline-block whitespace-nowrap rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
          أساسية
        </span>
      ) : null,
  },
];

// Case-insensitive search in code and name.
function matchesSearch(currency, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [currency.code, currency.name].some((value) => (value || "").toLowerCase().includes(text));
}

// Delete errors with a currency-specific meaning (BAD_REQUEST); others use getErrorMessage.
function getDeleteErrorMessage(err) {
  const { code, field } = err.response?.data || {};
  if (code === "BAD_REQUEST" && field === "isDefault") {
    return "لا يمكن حذف العملة الأساسية، اجعل عملة أخرى أساسية أولًا";
  }
  if (code === "BAD_REQUEST") return "لا يمكن حذف العملة لأنها مستخدمة في فواتير شراء";
  return getErrorMessage(err);
}

function Currencies() {
  // List: loaded on mount. reload() = retry (shows LoadingState), refresh() = silent (after every action).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(getCurrencies);
  const currencies = data ?? [];
  const defaultCurrency = currencies.find((currency) => currency.isDefault);
  const [search, setSearch] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: currencyToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [currencyToEdit, setCurrencyToEdit] = useState(null);

  // Make default
  const [currencyToMakeDefault, setCurrencyToMakeDefault] = useState(null);
  const [makingDefault, setMakingDefault] = useState(false);

  // Delete
  const [currencyToDelete, setCurrencyToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function showActionError(message) {
    hideSuccessMessage();
    setActionError(message);
  }

  function openAdd() {
    setCurrencyToEdit(null);
    setFormOpen(true);
  }

  function openEdit(currency) {
    setCurrencyToEdit(currency);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setCurrencyToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  async function handleMakeDefault() {
    setMakingDefault(true);
    try {
      await makeDefaultCurrency(currencyToMakeDefault.id);
      showSuccess("تم تغيير العملة الأساسية بنجاح");
    } catch (err) {
      showActionError(getErrorMessage(err));
    } finally {
      setMakingDefault(false);
      setCurrencyToMakeDefault(null);
    }
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCurrency(currencyToDelete.id);
      showSuccess("تم حذف العملة بنجاح");
    } catch (err) {
      showActionError(getDeleteErrorMessage(err));
    } finally {
      setDeleting(false);
      setCurrencyToDelete(null);
    }
    refresh();
  }

  // The make-default question names the current default (when there is one).
  function makeDefaultMessage() {
    const name = currencyToMakeDefault?.name;
    const replaced = defaultCurrency ? ` بدلًا من "${defaultCurrency.name}"` : "";
    return `سيتم جعل "${name}" العملة الأساسية${replaced}. تقييم المخزون يكون دائمًا بالعملة الأساسية.`;
  }

  const filteredCurrencies = currencies.filter((currency) => matchesSearch(currency, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل العملات..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (currencies.length === 0) {
      return (
        <EmptyState
          message="لا توجد عملات بعد — أضف العملة الأساسية (مثل الجنيه المصري EGP)"
          action={
            <Button onClick={openAdd}>
              <Plus size={18} />
              إضافة عملة
            </Button>
          }
        />
      );
    }

    return (
      <>
        {!defaultCurrency && (
          <Alert type="warning" className="mb-4">
            لم يتم تحديد عملة أساسية بعد
          </Alert>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالكود أو الاسم" />
          <span className="text-sm text-slate-500">عدد العملات: {filteredCurrencies.length}</span>
        </div>

        {filteredCurrencies.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة للبحث" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredCurrencies}
            renderActions={(currency) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${currency.name}`}
                  onClick={() => openEdit(currency)}
                >
                  <Pencil size={16} />
                </Button>
                {/* The default currency: no "make default" and no delete. */}
                {!currency.isDefault && (
                  <>
                    <Button
                      variant="ghost"
                      className="px-2"
                      title="اجعلها أساسية"
                      aria-label={`اجعلها أساسية ${currency.name}`}
                      onClick={() => setCurrencyToMakeDefault(currency)}
                    >
                      <Star size={16} />
                      <span className="text-xs">اجعلها أساسية</span>
                    </Button>
                    <Button
                      variant="danger-ghost"
                      className="px-2"
                      title="حذف"
                      aria-label={`حذف ${currency.name}`}
                      onClick={() => setCurrencyToDelete(currency)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
              </>
            )}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="العملات"
        subtitle="عملات الشراء والعملة الأساسية لتقييم المخزون"
        action={
          <Button onClick={openAdd}>
            <Plus size={18} />
            إضافة عملة
          </Button>
        }
      />

      {successMessage && (
        <Alert type="success" className="mb-4" onClose={hideSuccessMessage}>
          {successMessage}
        </Alert>
      )}
      {actionError && (
        <Alert type="error" className="mb-4" onClose={() => setActionError("")}>
          {actionError}
        </Alert>
      )}
      {refreshError && (
        <Alert type="error" className="mb-4">
          {refreshError}
        </Alert>
      )}

      {renderContent()}

      {formOpen && (
        <CurrencyFormModal
          currency={currencyToEdit}
          isFirstCurrency={currencies.length === 0}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      {/* Not destructive: the confirm button is blue (primary), not red. */}
      <ConfirmDialog
        open={Boolean(currencyToMakeDefault)}
        title="جعل العملة أساسية"
        message={makeDefaultMessage()}
        confirmLabel="اجعلها أساسية"
        confirmVariant="primary"
        onConfirm={handleMakeDefault}
        onCancel={() => setCurrencyToMakeDefault(null)}
        loading={makingDefault}
      />

      <ConfirmDialog
        open={Boolean(currencyToDelete)}
        title="حذف العملة"
        message={`هل أنت متأكد من حذف العملة "${currencyToDelete?.name}"؟`}
        confirmLabel="حذف العملة"
        onConfirm={handleDelete}
        onCancel={() => setCurrencyToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Currencies;
