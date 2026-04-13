type Command = {
  id: string;
  label: string;
  description: string;
  onSelect: () => void | Promise<void>;
};

type CommandPaletteProps = {
  open: boolean;
  commands: Command[];
  onClose: () => void;
};

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div className="palette" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="palette__header">
          <h2>Workspace Commands</h2>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="palette__list">
          {commands.map((command) => (
            <button
              className="palette__item"
              key={command.id}
              onClick={async () => {
                await command.onSelect();
                onClose();
              }}
              type="button"
            >
              <span className="palette__label">{command.label}</span>
              <span className="palette__description">{command.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
