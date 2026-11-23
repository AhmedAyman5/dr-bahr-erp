// Usage:
//   const columns = [
//     { key: "code", label: "الكود" },
//     { key: "name", label: "الاسم" },
//     { key: "createdAt", label: "تاريخ الإضافة", render: (row) => formatDate(row.createdAt) },
//   ];
//   <DataTable
//     columns={columns}
//     rows={branches}
//     renderActions={(row) => <Button variant="ghost" onClick={() => edit(row)}><Pencil size={16} /></Button>}
//   />
// Each row needs a unique "id" (or pass rowKey="otherField").

function DataTable({ columns, rows, renderActions, rowKey = "id" }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 text-start font-semibold">
                {column.label}
              </th>
            ))}
            {renderActions && <th className="px-4 py-3 text-start font-semibold">الإجراءات</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row[rowKey]} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-slate-900">
                  {column.render ? column.render(row) : (row[column.key] ?? "-")}
                </td>
              ))}
              {renderActions && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">{renderActions(row)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
