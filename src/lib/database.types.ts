type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      households: Table<
        { id: string; name: string; invite_code: string; created_at: string },
        {
          id?: string;
          name: string;
          invite_code?: string;
          created_at?: string;
        },
        { name?: string }
      >;
      household_members: Table<
        {
          household_id: string;
          user_id: string;
          role: "owner" | "member";
          created_at: string;
        },
        {
          household_id: string;
          user_id: string;
          role?: "owner" | "member";
          created_at?: string;
        },
        { role?: "owner" | "member" }
      >;
      daily_needs: Table<
        {
          id: string;
          household_id: string;
          title: string;
          time: string;
          details: string;
          required: boolean;
          type:
            | "walk"
            | "food"
            | "medicine"
            | "potty"
            | "play"
            | "grooming"
            | "other";
          duration_minutes: number;
          repeat_days: string[];
          created_at: string;
        },
        {
          id?: string;
          household_id: string;
          title: string;
          time: string;
          details?: string;
          required?: boolean;
          type?:
            | "walk"
            | "food"
            | "medicine"
            | "potty"
            | "play"
            | "grooming"
            | "other";
          duration_minutes?: number;
          repeat_days?: string[];
          created_at?: string;
        },
        {
          title?: string;
          time?: string;
          details?: string;
          required?: boolean;
          type?:
            | "walk"
            | "food"
            | "medicine"
            | "potty"
            | "play"
            | "grooming"
            | "other";
          duration_minutes?: number;
          repeat_days?: string[];
        }
      >;
      daily_need_occurrences: Table<
        {
          household_id: string;
          daily_need_id: string;
          occurrence_date: string;
          status: string;
          booked_by: string | null;
          booked_name: string | null;
          assigned_user_id: string | null;
          assigned_name: string | null;
          repeat_rule: string;
          reminder_enabled: boolean;
          completed_by: string | null;
          completed_name: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          household_id: string;
          daily_need_id: string;
          occurrence_date: string;
          status?: string;
          booked_by?: string | null;
          booked_name?: string | null;
          assigned_user_id?: string | null;
          assigned_name?: string | null;
          repeat_rule?: string;
          reminder_enabled?: boolean;
          completed_by?: string | null;
          completed_name?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          status?: string;
          booked_by?: string | null;
          booked_name?: string | null;
          assigned_user_id?: string | null;
          assigned_name?: string | null;
          repeat_rule?: string;
          reminder_enabled?: boolean;
          completed_by?: string | null;
          completed_name?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_household: {
        Args: { household_name: string };
        Returns: { id: string; name: string; invite_code: string }[];
      };
      join_household: {
        Args: { invite_code: string };
        Returns: string;
      };
      get_household_members: {
        Args: Record<string, never>;
        Returns: { user_id: string; display_name: string }[];
      };
      get_latest_household_occurrences: {
        Args: { target_date: string };
        Returns: Database["public"]["Tables"]["daily_need_occurrences"]["Row"][];
      };
      set_daily_need_occurrence: {
        Args: {
          target_need_id: string;
          target_date: string;
          next_status: "open" | "booked" | "done";
          actor_name: string;
          target_member_id: string;
          target_repeat_rule: "today" | "weekday" | "daily";
          reminder_enabled: boolean;
        };
        Returns: Database["public"]["Tables"]["daily_need_occurrences"]["Row"][];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
