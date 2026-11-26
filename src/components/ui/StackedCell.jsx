// A table cell with a main value and, under it, a secondary line in small gray text.
// Keeps wide tables narrow: secondary info goes UNDER the main value instead of in its own column
// (accountants should not have to scroll sideways).
// Usage (in a DataTable column):
//   { key: "name", label: "الاسم", render: (row) => <StackedCell main={row.name} sub={row.category?.name} /> }
// sub empty / null → only the main value (no empty second line).
function StackedCell({ main, sub }) {
  return (
    <div>
      <div>{main}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default StackedCell;
