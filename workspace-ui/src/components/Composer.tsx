import { FormEvent, useState } from "react";

type ComposerProps = {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
};

export function Composer({ disabled, onSubmit }: ComposerProps) {
  const [value, setValue] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled) {
      return;
    }
    setValue("");
    await onSubmit(text);
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        className="composer__input"
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ask Hermes to inspect code, run tools, or explain the workspace..."
        rows={4}
        value={value}
      />
      <div className="composer__actions">
        <span className="composer__hint">Cmd/Ctrl+K for commands</span>
        <button className="primary-button" disabled={disabled} type="submit">
          Send
        </button>
      </div>
    </form>
  );
}
