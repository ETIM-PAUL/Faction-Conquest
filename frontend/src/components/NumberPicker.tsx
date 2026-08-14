type ToggleProps = {
  mode: "toggle";
  max: number;
  selected: number[];
  onToggle: (n: number) => void;
  limit: number;
  disabledNumbers?: Set<number>;
  disabledTitle?: string;
};

type RadioProps = {
  mode: "radio";
  max: number;
  selected: number | null;
  onSelect: (n: number) => void;
};

type Props = ToggleProps | RadioProps;

/// Clickable number grid replacing the old comma-separated text input —
/// same tile language as the map/faction cards (44px+ targets, accent
/// highlight on selection, glyph-free here since numbers ARE the label).
export function NumberPicker(props: Props) {
  const numbers = Array.from({ length: props.max }, (_, i) => i + 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))", gap: 4 }}>
      {numbers.map((n) => {
        const isSelected = props.mode === "toggle" ? props.selected.includes(n) : props.selected === n;
        const isOwnZone = props.mode === "toggle" && Boolean(props.disabledNumbers?.has(n));
        const atLimit = props.mode === "toggle" && !isSelected && props.selected.length >= props.limit;

        return (
          <button
            key={n}
            type="button"
            onClick={() => (props.mode === "toggle" ? props.onToggle(n) : props.onSelect(n))}
            disabled={atLimit || isOwnZone}
            aria-pressed={isSelected}
            title={isOwnZone ? props.disabledTitle : undefined}
            style={{
              minWidth: 40,
              minHeight: 40,
              padding: 0,
              fontSize: "var(--text-sm)",
              fontWeight: isSelected ? 700 : 400,
              background: isSelected ? "var(--accent)" : "var(--bg)",
              color: isSelected ? "#15120d" : "var(--text)",
              borderColor: isSelected ? "var(--accent)" : "var(--panel-border)",
              opacity: isOwnZone ? 0.4 : 1,
              cursor: isOwnZone ? "not-allowed" : undefined,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
