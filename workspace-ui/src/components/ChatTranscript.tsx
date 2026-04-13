import type { SessionMessage } from "../types";

type ChatTranscriptProps = {
  messages: SessionMessage[];
  pendingAssistant: string;
};

function MessageBubble({ message }: { message: SessionMessage }) {
  const roleLabel = message.role === "assistant" ? "Hermes" : message.role;
  return (
    <article className={`message message--${message.role}`}>
      <header className="message__header">{roleLabel}</header>
      <pre className="message__body">{message.content}</pre>
    </article>
  );
}

export function ChatTranscript({ messages, pendingAssistant }: ChatTranscriptProps) {
  return (
    <div className="transcript">
      {messages.map((message, index) => (
        <MessageBubble key={`${message.role}-${index}`} message={message} />
      ))}
      {pendingAssistant ? (
        <article className="message message--assistant message--streaming">
          <header className="message__header">Hermes</header>
          <pre className="message__body">{pendingAssistant}</pre>
        </article>
      ) : null}
    </div>
  );
}
