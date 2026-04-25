export type PipelineTab = "accounts" | "activities" | "action-cards" | "board";

export type DealStage =
  | "prospecting"
  | "discovery"
  | "solution-design"
  | "proposal"
  | "negotiation"
  | "closed-won"
  | "closed-lost";

export type ActivityType = "meeting" | "call" | "email" | "note" | "other";

export type Priority = "high" | "medium" | "low";

export type CardStatus = "active" | "completed" | "dismissed";

export interface Account {
  id: string;
  name: string;
  industry: string;
  description: string;
  deal_value: number;
  currency: string;
  probability: number;
  stage: DealStage;
  close_date: string | null;
  champion: string;
  economic_buyer: string;
  next_step: string;
  next_step_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  account_id: string;
  account_name: string;
  type: ActivityType;
  brief: string;
  date: string;
  analyzed: boolean;
  action_card_id: string | null;
}

export interface ActionItem {
  text: string;
  priority: Priority;
  rationale: string;
  deadline: string | null;
  completed: boolean;
}

export interface MeddicGap {
  element: string;
  status: string;
  next_step: string;
}

export interface StakeholderAction {
  stakeholder: string;
  role: string;
  action: string;
  framing: string;
}

export interface RiskFlag {
  flag: string;
  severity: Priority;
  mitigation: string;
}

export interface ActionCard {
  id: string;
  account_id: string;
  account_name: string;
  activity_id: string;
  generated_at: string;
  status: CardStatus;
  recommendations: {
    immediate_actions: ActionItem[];
    meddic_gaps: MeddicGap[];
    stakeholder_actions: StakeholderAction[];
    next_meeting_agenda: string[];
    risk_flags: RiskFlag[];
  };
}

export interface PipelineData {
  accounts: Account[];
  activities: Activity[];
  action_cards: ActionCard[];
}

export interface DelegateActionRequest {
  account: Account | null;
  action: ActionItem;
  actionIndex: number;
  accountName: string;
  activityId: string;
  cardId: string;
}
