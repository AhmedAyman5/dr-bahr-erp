// Usage:
//   <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الكود" />
// Note: onChange receives the text directly (not the event).
import { Search } from "lucide-react";

function SearchInput({ value, onChange, placeholder = "بحث...", className = "" }) {
  return (
    <div className={`relative w-full max-w-sm ${className}`}>
      <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 ps-10 pe-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export default SearchInput;
