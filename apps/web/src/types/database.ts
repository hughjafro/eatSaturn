export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ingredient_synonyms: {
        Row: {
          canonical_name: string
          id: string
          synonym: string
        }
        Insert: {
          canonical_name: string
          id?: string
          synonym: string
        }
        Update: {
          canonical_name?: string
          id?: string
          synonym?: string
        }
        Relationships: []
      }
      llm_usage_log: {
        Row: {
          cached_tokens: number
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          logged_date: string
          meal_plan_id: string | null
          model: string
          output_tokens: number
          user_tier: string | null
        }
        Insert: {
          cached_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          logged_date?: string
          meal_plan_id?: string | null
          model: string
          output_tokens?: number
          user_tier?: string | null
        }
        Update: {
          cached_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          logged_date?: string
          meal_plan_id?: string | null
          model?: string
          output_tokens?: number
          user_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_log_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_days: {
        Row: {
          day_of_week: number
          id: string
          meal_plan_id: string
          meal_type: string
          notes: string | null
          recipe_id: string
          servings: number
        }
        Insert: {
          day_of_week: number
          id?: string
          meal_plan_id: string
          meal_type: string
          notes?: string | null
          recipe_id: string
          servings?: number
        }
        Update: {
          day_of_week?: number
          id?: string
          meal_plan_id?: string
          meal_type?: string
          notes?: string | null
          recipe_id?: string
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_days_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_days_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          id: string
          is_premium_plan: boolean
          llm_model_used: string | null
          llm_summary: string | null
          status: string
          store_ids: string[]
          total_cost: number | null
          user_id: string
          week_of: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_premium_plan?: boolean
          llm_model_used?: string | null
          llm_summary?: string | null
          status?: string
          store_ids: string[]
          total_cost?: number | null
          user_id: string
          week_of: string
        }
        Update: {
          created_at?: string
          id?: string
          is_premium_plan?: boolean
          llm_model_used?: string | null
          llm_summary?: string | null
          status?: string
          store_ids?: string[]
          total_cost?: number | null
          user_id?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          estimated_cost: number | null
          id: string
          ingredient_name: string
          is_pantry_staple: boolean
          normalized_name: string
          quantity: number | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          estimated_cost?: number | null
          id?: string
          ingredient_name: string
          is_pantry_staple?: boolean
          normalized_name: string
          quantity?: number | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          estimated_cost?: number | null
          id?: string
          ingredient_name?: string
          is_pantry_staple?: boolean
          normalized_name?: string
          quantity?: number | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          cook_time_minutes: number | null
          created_at: string
          cuisine_type: string | null
          description: string | null
          estimated_cost: number | null
          external_id: string | null
          id: string
          image_url: string | null
          instructions: string[] | null
          is_gluten_free: boolean
          is_vegan: boolean
          is_vegetarian: boolean
          meal_type: string
          prep_time_minutes: number | null
          servings: number | null
          source: string
          title: string
        }
        Insert: {
          cook_time_minutes?: number | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          estimated_cost?: number | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[] | null
          is_gluten_free?: boolean
          is_vegan?: boolean
          is_vegetarian?: boolean
          meal_type: string
          prep_time_minutes?: number | null
          servings?: number | null
          source?: string
          title: string
        }
        Update: {
          cook_time_minutes?: number | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          estimated_cost?: number | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[] | null
          is_gluten_free?: boolean
          is_vegan?: boolean
          is_vegetarian?: boolean
          meal_type?: string
          prep_time_minutes?: number | null
          servings?: number | null
          source?: string
          title?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          category: string | null
          created_at: string
          discount_pct: number | null
          id: string
          image_url: string | null
          normalized_name: string
          product_name: string
          raw_description: string | null
          regular_price: number | null
          sale_price: number | null
          store_id: string
          unit: string | null
          week_of: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          discount_pct?: number | null
          id?: string
          image_url?: string | null
          normalized_name: string
          product_name: string
          raw_description?: string | null
          regular_price?: number | null
          sale_price?: number | null
          store_id: string
          unit?: string | null
          week_of: string
        }
        Update: {
          category?: string | null
          created_at?: string
          discount_pct?: number | null
          id?: string
          image_url?: string | null
          normalized_name?: string
          product_name?: string
          raw_description?: string | null
          regular_price?: number | null
          sale_price?: number | null
          store_id?: string
          unit?: string | null
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          aisle_category: string | null
          id: string
          ingredient_name: string
          on_sale: boolean
          quantity: number | null
          regular_price: number | null
          sale_item_id: string | null
          sale_price: number | null
          shopping_list_id: string
          store_id: string | null
          unit: string | null
        }
        Insert: {
          aisle_category?: string | null
          id?: string
          ingredient_name: string
          on_sale?: boolean
          quantity?: number | null
          regular_price?: number | null
          sale_item_id?: string | null
          sale_price?: number | null
          shopping_list_id: string
          store_id?: string | null
          unit?: string | null
        }
        Update: {
          aisle_category?: string | null
          id?: string
          ingredient_name?: string
          on_sale?: boolean
          quantity?: number | null
          regular_price?: number | null
          sale_item_id?: string | null
          sale_price?: number | null
          shopping_list_id?: string
          store_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          generated_at: string
          id: string
          meal_plan_id: string
          total_cost: number | null
        }
        Insert: {
          generated_at?: string
          id?: string
          meal_plan_id: string
          total_cost?: number | null
        }
        Update: {
          generated_at?: string
          id?: string
          meal_plan_id?: string
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: true
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          chain_key: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          scrape_config: Json
          scrape_url: string
        }
        Insert: {
          chain_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          scrape_config?: Json
          scrape_url: string
        }
        Update: {
          chain_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          scrape_config?: Json
          scrape_url?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          cuisine_preferences: string[]
          dietary_restrictions: string[]
          disliked_ingredients: string[]
          id: string
          notification_day: string
          preferred_store_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cuisine_preferences?: string[]
          dietary_restrictions?: string[]
          disliked_ingredients?: string[]
          id?: string
          notification_day?: string
          preferred_store_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cuisine_preferences?: string[]
          dietary_restrictions?: string[]
          disliked_ingredients?: string[]
          id?: string
          notification_day?: string
          preferred_store_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          household_size: number
          id: string
          stripe_customer_id: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          household_size?: number
          id: string
          stripe_customer_id?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          household_size?: number
          id?: string
          stripe_customer_id?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_recipes_matching_sale_items: {
        Args: {
          p_gluten_free?: boolean
          p_similarity_threshold?: number
          p_store_ids: string[]
          p_vegan?: boolean
          p_vegetarian?: boolean
          p_week_of: string
        }
        Returns: {
          estimated_cost: number
          is_gluten_free: boolean
          is_vegan: boolean
          is_vegetarian: boolean
          matched_items: number
          meal_type: string
          recipe_id: string
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
