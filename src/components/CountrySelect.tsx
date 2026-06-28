import { useState } from "react";
import { COUNTRIES, countryLabel } from "../lib/countries";

// Odstraní diakritiku pro hledání („svycar" najde „Švýcarsko").
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = norm(query.trim());
  const filtered = q
    ? COUNTRIES.filter((c) => norm(c.name).includes(q) || c.code.toLowerCase().includes(q))
    : COUNTRIES;

  return (
    <div className="country-select">
      <input
        className="text-input"
        value={open ? query : countryLabel(value)}
        placeholder="Hledej zemi…"
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="country-list">
          {filtered.length === 0 ? (
            <div className="country-empty muted small">Žádná země</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                className={"country-item" + (c.code === value ? " active" : "")}
                onMouseDown={(e) => {
                  e.preventDefault(); // ať se nestihne blur dřív než výběr
                  onChange(c.code);
                  setOpen(false);
                }}
              >
                <span className="country-flag">{c.flag}</span> {c.name}
                <span className="muted small"> {c.code}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
