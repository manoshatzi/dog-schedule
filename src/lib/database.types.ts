// Hand-maintained to match supabase/migrations/*.sql (through
// 202610150001_push_notifications.sql). Regenerate with `supabase gen types`
// once the CLI is set up, and keep the unions below in sync with the checks.

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TaskType =
  | "walk"
  | "food"
  | "medicine"
  | "potty"
  | "play"
  | "grooming"
  | "vet"
  | "other";
export type AmountUnit = "g" | "ml" | "cup" | "pill" | "drop";
export type OccurrenceStatus = "open" | "booked" | "done";
export type ClaimRepeatRule = "today" | "weekday" | "daily";
export type TransitionAction =
  | "claim"
  | "take_over"
  | "release"
  | "complete"
  | "undo"
  | "reopen";
export type FamilyActivityPreference = "off" | "must_do" | "all";
export type TransitionError =
  | "already_claimed"
  | "already_done"
  | "state_changed"
  | "not_allowed";

type DailyNeedRow = {
  id: string;
  household_id: string;
  dog_id: string | null;
  title: string;
  time: string;
  details: string;
  required: boolean;
  type: TaskType;
  duration_minutes: number;
  repeat_days: string[];
  amount_value: number | null;
  amount_unit: AmountUnit | null;
  one_off_date: string | null;
  default_assignee_id: string | null;
  reminder_minutes_before: number | null;
  archived_at: string | null;
  created_at: string;
};

type DailyNeedWritable = {
  dog_id?: string | null;
  title?: string;
  time?: string;
  details?: string;
  required?: boolean;
  type?: TaskType;
  duration_minutes?: number;
  repeat_days?: string[];
  amount_value?: number | null;
  amount_unit?: AmountUnit | null;
  one_off_date?: string | null;
  default_assignee_id?: string | null;
  reminder_minutes_before?: number | null;
  archived_at?: string | null;
};

type OccurrenceRow = {
  household_id: string;
  daily_need_id: string;
  occurrence_date: string;
  status: OccurrenceStatus;
  booked_by: string | null;
  booked_name: string | null;
  assigned_user_id: string | null;
  assigned_name: string | null;
  repeat_rule: ClaimRepeatRule;
  reminder_enabled: boolean;
  completed_by: string | null;
  completed_name: string | null;
  completed_at: string | null;
  previous_status: "open" | "booked" | null;
  created_at: string;
  updated_at: string;
};

type ClaimSeriesRow = {
  id: string;
  household_id: string;
  daily_need_id: string;
  assigned_user_id: string | null;
  assigned_name: string;
  repeat_rule: "weekday" | "daily";
  weekday: number | null;
  starts_on: string;
  ends_on: string | null;
  reminder_enabled: boolean;
  created_by: string | null;
  created_at: string;
};

type NotificationPreferencesRow = {
  user_id: string;
  claimed_tasks: boolean;
  open_tasks: boolean;
  overdue_tasks: boolean;
  family_activity: FamilyActivityPreference;
  new_members: boolean;
  updated_at: string;
};

type DogRow = {
  id: string;
  household_id: string;
  name: string;
  photo_path: string | null;
  birthday: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      households: Table<
        {
          id: string;
          name: string;
          invite_code: string;
          /** IANA zone; null until a member's device sets it. */
          timezone: string | null;
          created_at: string;
        },
        {
          id?: string;
          name: string;
          invite_code?: string;
          timezone?: string | null;
          created_at?: string;
        },
        { name?: string }
      >;
      household_members: Table<
        {
          household_id: string;
          user_id: string;
          role: "owner" | "member";
          display_name: string | null;
          created_at: string;
        },
        {
          household_id: string;
          user_id: string;
          role?: "owner" | "member";
          display_name?: string | null;
          created_at?: string;
        },
        { role?: "owner" | "member"; display_name?: string | null }
      >;
      dogs: Table<
        DogRow,
        {
          id?: string;
          household_id: string;
          name: string;
          photo_path?: string | null;
          birthday?: string | null;
          created_at?: string;
        },
        { name?: string; photo_path?: string | null; birthday?: string | null }
      >;
      daily_needs: Table<
        DailyNeedRow,
        DailyNeedWritable & {
          id?: string;
          household_id: string;
          title: string;
          time: string;
          created_at?: string;
        },
        DailyNeedWritable
      >;
      daily_need_occurrences: Table<
        OccurrenceRow,
        Partial<OccurrenceRow> & {
          household_id: string;
          daily_need_id: string;
          occurrence_date: string;
        },
        Partial<Omit<OccurrenceRow, "household_id" | "daily_need_id">>
      >;
      claim_series: Table<ClaimSeriesRow, never, never>;
      /** Read-only for the app; written via register/unregister_push_token. */
      push_tokens: Table<
        {
          id: string;
          user_id: string;
          expo_token: string;
          platform: "ios" | "android";
          locale: string;
          created_at: string;
          updated_at: string;
        },
        never,
        never
      >;
      notification_preferences: Table<
        NotificationPreferencesRow,
        Partial<NotificationPreferencesRow> & { user_id: string },
        Partial<Omit<NotificationPreferencesRow, "user_id">>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_household: {
        Args: { household_name: string };
        Returns: { id: string; name: string; invite_code: string }[];
      };
      create_family: {
        Args: { dog_name: string; family_name?: string };
        Returns: { id: string; name: string; invite_code: string }[];
      };
      join_household: {
        Args: { invite_code: string };
        Returns: string;
      };
      set_my_display_name: {
        Args: { new_name: string };
        Returns: undefined;
      };
      get_household_members: {
        Args: Record<string, never>;
        Returns: { user_id: string; display_name: string }[];
      };
      get_family_members: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          display_name: string;
          role: "owner" | "member";
          joined_at: string;
        }[];
      };
      get_latest_household_occurrences: {
        Args: { target_date: string };
        Returns: OccurrenceRow[];
      };
      /** Legacy last-write-wins RPC, kept for older app builds. */
      set_daily_need_occurrence: {
        Args: {
          target_need_id: string;
          target_date: string;
          next_status: OccurrenceStatus;
          actor_name: string;
          target_member_id: string;
          target_repeat_rule: ClaimRepeatRule;
          reminder_enabled: boolean;
        };
        Returns: OccurrenceRow[];
      };
      set_family_timezone: {
        Args: { new_timezone: string };
        Returns: string;
      };
      register_push_token: {
        Args: {
          token: string;
          token_platform: "ios" | "android";
          token_locale?: string;
        };
        Returns: undefined;
      };
      unregister_push_token: {
        Args: { token: string };
        Returns: undefined;
      };
      transition_occurrence: {
        Args: {
          target_need_id: string;
          target_date: string;
          target_action: TransitionAction;
          expected_status: OccurrenceStatus;
          expected_actor?: string | null;
          target_member_id?: string | null;
          target_repeat_rule?: ClaimRepeatRule;
          target_reminder_enabled?: boolean;
          target_release_scope?: "day" | "series";
        };
        /** { ok, error: TransitionError | null, occurrence: OccurrenceRow } */
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type TransitionResult = {
  ok: boolean;
  error: TransitionError | null;
  occurrence: OccurrenceRow;
};
