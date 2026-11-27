// The document number of a stock movement (رقم المستند), e.g. in كارت الصنف and حركات المخزون.
//   sourceType "PI" (purchase invoice) → a link to /purchase-invoices/:sourceId
//   another document ("PR" purchase returns: no page yet) → the number as plain text
//   no document (OPENING / ADJUSTMENT) → "-"
// Usage: <SourceDocumentLink movement={row} />   (row: sourceType, sourceId, sourceCode)
import { Link } from "react-router-dom";
import { formatSourceCode } from "../../utils/format";

// The document types that have a details page.
const DOCUMENT_PAGES = { PI: "/purchase-invoices" };

function SourceDocumentLink({ movement }) {
  const text = formatSourceCode(movement);
  if (text === "-") return text;
  const basePath = DOCUMENT_PAGES[movement.sourceType];
  if (!basePath || !movement.sourceId) return <span dir="ltr">{text}</span>;
  return (
    <Link
      to={`${basePath}/${movement.sourceId}`}
      dir="ltr"
      className="rounded font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {text}
    </Link>
  );
}

export default SourceDocumentLink;
