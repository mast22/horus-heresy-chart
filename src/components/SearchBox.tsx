import { useMemo, useState } from "react";

import { type SearchResult, search } from "../flow/search";

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  work: "Work",
  author: "Author",
  legion: "Legion",
};

export function SearchBox({
  onSelect,
}: {
  onSelect: (nodeIds: readonly string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => search(query), [query]);

  function select(result: SearchResult) {
    onSelect(result.nodeIds);
    setQuery(result.label);
    setOpen(false);
  }

  function move(delta: number) {
    if (results.length === 0) {
      return;
    }
    setActiveIndex(
      (index) => (index + delta + results.length) % results.length,
    );
  }

  return (
    <div className="chart-search">
      <input
        className="chart-search-input"
        type="search"
        placeholder="Search author, legion or work"
        value={query}
        aria-label="Search the chart"
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "Enter" && results.length > 0) {
            select(results[activeIndex] ?? results[0]);
          }
        }}
      />
      {open && results.length > 0 ? (
        <ul className="chart-search-results">
          {results.map((result, index) => (
            <li key={result.key}>
              <button
                type="button"
                className={
                  index === activeIndex
                    ? "chart-search-result is-active"
                    : "chart-search-result"
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(result);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="chart-search-label">{result.label}</span>
                <span className="chart-search-meta">
                  <span className={`chart-search-kind kind-${result.kind}`}>
                    {KIND_LABEL[result.kind]}
                  </span>
                  {result.meta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
