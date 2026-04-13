import { useEffect, useRef, useState } from "react";

type Command = {
  id: string;
  label: string;
  description: string;
  icon: string;
  shortcut?: string;
  onSelect: () => void | Promise<void>;
};

type CommandPaletteProps = {
  open: boolean;
  commands: Command[];
  onClose: () => void;
};

function matchesFilter(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter(
    (c) => matchesFilter(c.label, query) || matchesFilter(c.description, query)
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setFocusedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const cmd = filtered[focusedIndex];
        if (cmd) {
          void cmd.onSelect();
          onClose();
        }
      } else if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [open, filtered, focusedIndex, onClose]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="palette__search">
          <input
            ref={inputRef}
            className="palette__search-input"
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusedIndex(0);
            }}
            placeholder="Type a command..."
            value={query}
          />
        </div>
        <div className="palette__list">
          {filtered.length === 0 && (
            <p style={{ padding: "16px", textAlign: "center", fontSize: "0.85rem", color: "var(--text-tertiary)" }}>
              No commands found
            </p>
          )}
          {filtered.map((command, index) => (
            <button
              className={`palette__item${index === focusedIndex ? " palette__item--focused" : ""}`}
              key={command.id}
              onClick={async () => {
                await command.onSelect();
                onClose();
              }}
              onMouseEnter={() => setFocusedIndex(index)}
              type="button"
            >
              <span className="palette__item-icon">{command.icon}</span>
              <div className="palette__item-content">
                <span className="palette__label">{command.label}</span>
                <span className="palette__description">{command.description}</span>
              </div>
              {command.shortcut && (
                <span className="palette__shortcut">{command.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
