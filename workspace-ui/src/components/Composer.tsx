import { FormEvent, useEffect, useRef, useState } from "react";

type ComposerProps = {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
};

export function Composer({ disabled, onSubmit }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSubmit(text);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__inner">
        <div className="composer__input-wrapper">
          <textarea
            ref={textareaRef}
            className="composer__input"
            disabled={disabled}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Hermes anything..."
            rows={1}
            value={value}
          />
          <button className="composer__send" disabled={disabled || !value.trim()} type="submit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}
