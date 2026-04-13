import type { BridgeEvent } from "../types";

type ActivityRailProps = {
  events: BridgeEvent[];
};

function formatEvent(event: BridgeEvent): string {
  switch (event.type) {
    case "tool.started":
      return event.title || "Tool started";
    case "tool.completed":
      return event.text || "Tool completed";
    case "thinking.delta":
      return event.text || "Thinking";
    case "run.finished":
      return "Run completed";
    case "run.cancelled":
      return "Run cancelled";
    case "run.failed":
      return event.error || "Run failed";
    case "approval.requested":
      return "Approval requested";
    default:
      return event.type || "Event";
  }
}

export function ActivityRail({ events }: ActivityRailProps) {
  return (
    <aside className="activity">
      <div className="activity__header">
        <p className="eyebrow">Live</p>
        <h2>Agent Activity</h2>
      </div>
      <div className="activity__list">
        {events.map((event, index) => (
          <article className="activity__item" key={`${event.type}-${index}`}>
            <div className="activity__type">{event.type || "event"}</div>
            <div className="activity__text">{formatEvent(event)}</div>
          </article>
        ))}
      </div>
    </aside>
  );
}
