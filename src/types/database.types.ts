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
      agreed_term_type: {
        Row: {
          code: string
          description: string
          sort_order: number
          value_format: string
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
          value_format: string
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
          value_format?: string
        }
        Relationships: []
      }
      artifact_category: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      audit_action_type: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string
          reversibility_tier: string | null
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description: string
          reversibility_tier?: string | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string
          reversibility_tier?: string | null
        }
        Relationships: []
      }
      audit_actor_type: {
        Row: {
          code: string
          description: string
        }
        Insert: {
          code: string
          description: string
        }
        Update: {
          code?: string
          description?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_person_id: string | null
          actor_type: string
          after_diff: Json | null
          before_diff: Json | null
          company_id: string
          content_id: string
          content_type: string
          created_at: string
          entry_hash: string
          hmac_schema_version: number
          id: string
          metadata: Json
          on_behalf_of_person_id: string | null
          prev_entry_hash: string | null
          reason: string | null
          reverses_audit_id: string | null
          sequence_number: number
        }
        Insert: {
          action: string
          actor_person_id?: string | null
          actor_type: string
          after_diff?: Json | null
          before_diff?: Json | null
          company_id: string
          content_id: string
          content_type: string
          created_at?: string
          entry_hash: string
          hmac_schema_version?: number
          id?: string
          metadata?: Json
          on_behalf_of_person_id?: string | null
          prev_entry_hash?: string | null
          reason?: string | null
          reverses_audit_id?: string | null
          sequence_number?: number
        }
        Update: {
          action?: string
          actor_person_id?: string | null
          actor_type?: string
          after_diff?: Json | null
          before_diff?: Json | null
          company_id?: string
          content_id?: string
          content_type?: string
          created_at?: string
          entry_hash?: string
          hmac_schema_version?: number
          id?: string
          metadata?: Json
          on_behalf_of_person_id?: string | null
          prev_entry_hash?: string | null
          reason?: string | null
          reverses_audit_id?: string | null
          sequence_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_action_fkey"
            columns: ["action"]
            isOneToOne: false
            referencedRelation: "audit_action_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "audit_log_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_type_fkey"
            columns: ["actor_type"]
            isOneToOne: false
            referencedRelation: "audit_actor_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_content_type_fkey"
            columns: ["content_type"]
            isOneToOne: false
            referencedRelation: "auditable_content_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "audit_log_on_behalf_of_person_id_fkey"
            columns: ["on_behalf_of_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_reverses_audit_id_fkey"
            columns: ["reverses_audit_id"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
        ]
      }
      auditable_content_type: {
        Row: {
          code: string
          description: string
          target_table: string
        }
        Insert: {
          code: string
          description: string
          target_table: string
        }
        Update: {
          code?: string
          description?: string
          target_table?: string
        }
        Relationships: []
      }
      batch_terpene: {
        Row: {
          id: string
          percent: number | null
          product_batch_id: string
          terpene_code: string
        }
        Insert: {
          id?: string
          percent?: number | null
          product_batch_id: string
          terpene_code: string
        }
        Update: {
          id?: string
          percent?: number | null
          product_batch_id?: string
          terpene_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_terpene_product_batch_id_fkey"
            columns: ["product_batch_id"]
            isOneToOne: false
            referencedRelation: "product_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_terpene_terpene_code_fkey"
            columns: ["terpene_code"]
            isOneToOne: false
            referencedRelation: "terpene"
            referencedColumns: ["code"]
          },
        ]
      }
      chat_message: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          metadata: Json
          sender: string
          sender_person_id: string | null
          thread_id: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          sender: string
          sender_person_id?: string | null
          thread_id: string
          type?: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          sender?: string
          sender_person_id?: string | null
          thread_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_sender_fkey"
            columns: ["sender"]
            isOneToOne: false
            referencedRelation: "content_author"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "chat_message_sender_person_id_fkey"
            columns: ["sender_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_thread"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "chat_message_type"
            referencedColumns: ["code"]
          },
        ]
      }
      chat_message_type: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      chat_thread: {
        Row: {
          created_at: string
          deal_card_id: string | null
          deleted_at: string | null
          id: string
          person_a_id: string | null
          person_b_id: string | null
          relationship_id: string
          type: string
        }
        Insert: {
          created_at?: string
          deal_card_id?: string | null
          deleted_at?: string | null
          id?: string
          person_a_id?: string | null
          person_b_id?: string | null
          relationship_id: string
          type: string
        }
        Update: {
          created_at?: string
          deal_card_id?: string | null
          deleted_at?: string | null
          id?: string
          person_a_id?: string | null
          person_b_id?: string | null
          relationship_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_thread_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_thread_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_thread_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationship"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_thread_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "chat_thread_type"
            referencedColumns: ["code"]
          },
        ]
      }
      chat_thread_type: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      company: {
        Row: {
          address: string | null
          country: string
          cover_path: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          logo_path: string | null
          metadata: Json
          name: string
          primary_products: string | null
          tagline: string | null
          updated_at: string
          updated_by: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          warehouse_location: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          country: string
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          logo_path?: string | null
          metadata?: Json
          name: string
          primary_products?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          warehouse_location?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          country?: string
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          logo_path?: string | null
          metadata?: Json
          name?: string
          primary_products?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          warehouse_location?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_verification_status_fkey"
            columns: ["verification_status"]
            isOneToOne: false
            referencedRelation: "company_verification_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "company_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      company_license_file: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          file_size_bytes: number
          id: string
          mime_type: string
          original_filename: string
          scan_status: string
          storage_path: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_size_bytes: number
          id?: string
          mime_type: string
          original_filename: string
          scan_status?: string
          storage_path: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_size_bytes?: number
          id?: string
          mime_type?: string
          original_filename?: string
          scan_status?: string
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_license_file_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_license_file_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_license_file_scan_status_fkey"
            columns: ["scan_status"]
            isOneToOne: false
            referencedRelation: "file_scan_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "company_license_file_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      company_type: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      company_type_assignment: {
        Row: {
          company_id: string
          company_type_code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
        }
        Insert: {
          company_id: string
          company_type_code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string
          company_type_code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_type_assignment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_type_assignment_company_type_code_fkey"
            columns: ["company_type_code"]
            isOneToOne: false
            referencedRelation: "company_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "company_type_assignment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      company_verification_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      contact_provider: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      contact_record: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string
          email_count: number
          first_seen: string | null
          id: string
          inferred_company_id: string | null
          last_seen: string | null
          metadata: Json
          person_id: string
          provider: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email: string
          email_count?: number
          first_seen?: string | null
          id?: string
          inferred_company_id?: string | null
          last_seen?: string | null
          metadata?: Json
          person_id: string
          provider: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string
          email_count?: number
          first_seen?: string | null
          id?: string
          inferred_company_id?: string | null
          last_seen?: string | null
          metadata?: Json
          person_id?: string
          provider?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_record_inferred_company_id_fkey"
            columns: ["inferred_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_record_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_record_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "contact_provider"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "contact_record_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "contact_role"
            referencedColumns: ["code"]
          },
        ]
      }
      contact_role: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      content_author: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      deal_artifact: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deal_workspace_id: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          file_size_bytes: number
          id: string
          metadata: Json
          mime_type: string
          original_filename: string
          scan_status: string
          storage_path: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_by_company_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deal_workspace_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_size_bytes: number
          id?: string
          metadata?: Json
          mime_type: string
          original_filename: string
          scan_status?: string
          storage_path: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by_company_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deal_workspace_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_size_bytes?: number
          id?: string
          metadata?: Json
          mime_type?: string
          original_filename?: string
          scan_status?: string
          storage_path?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_artifact_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "deal_artifact_category"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "deal_artifact_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_artifact_deal_workspace_id_fkey"
            columns: ["deal_workspace_id"]
            isOneToOne: false
            referencedRelation: "deal_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_artifact_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_artifact_scan_status_fkey"
            columns: ["scan_status"]
            isOneToOne: false
            referencedRelation: "file_scan_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "deal_artifact_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_artifact_uploaded_by_company_id_fkey"
            columns: ["uploaded_by_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_artifact_category: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      deal_card: {
        Row: {
          buyer_po_number: string | null
          created_at: string
          created_by: string | null
          currency: string
          deal_type: string
          deleted_at: string | null
          delivery_date_target: string | null
          hs_deal_number: string | null
          id: string
          incoterms_code: string | null
          initiating_company_id: string
          metadata: Json
          offer_expires_at: string | null
          payment_terms_code: string | null
          relationship_id: string
          seller_so_number: string | null
          status: string
          thread_id: string | null
          updated_at: string
          updated_by: string | null
          value_net: number | null
          version: number
        }
        Insert: {
          buyer_po_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_type: string
          deleted_at?: string | null
          delivery_date_target?: string | null
          hs_deal_number?: string | null
          id?: string
          incoterms_code?: string | null
          initiating_company_id: string
          metadata?: Json
          offer_expires_at?: string | null
          payment_terms_code?: string | null
          relationship_id: string
          seller_so_number?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value_net?: number | null
          version?: number
        }
        Update: {
          buyer_po_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_type?: string
          deleted_at?: string | null
          delivery_date_target?: string | null
          hs_deal_number?: string | null
          id?: string
          incoterms_code?: string | null
          initiating_company_id?: string
          metadata?: Json
          offer_expires_at?: string | null
          payment_terms_code?: string | null
          relationship_id?: string
          seller_so_number?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value_net?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_card_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_card_deal_type_fkey"
            columns: ["deal_type"]
            isOneToOne: false
            referencedRelation: "deal_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "deal_card_incoterms_code_fkey"
            columns: ["incoterms_code"]
            isOneToOne: false
            referencedRelation: "incoterms"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "deal_card_initiating_company_id_fkey"
            columns: ["initiating_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_card_payment_terms_code_fkey"
            columns: ["payment_terms_code"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "deal_card_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationship"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_card_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "deal_card_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "deal_card_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_thread"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_card_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_card_log: {
        Row: {
          change_summary: string
          changed_by: string
          changed_by_person_id: string | null
          created_at: string
          deal_card_id: string
          id: string
          origin: string
          version: number
        }
        Insert: {
          change_summary: string
          changed_by: string
          changed_by_person_id?: string | null
          created_at?: string
          deal_card_id: string
          id?: string
          origin: string
          version: number
        }
        Update: {
          change_summary?: string
          changed_by?: string
          changed_by_person_id?: string | null
          created_at?: string
          deal_card_id?: string
          id?: string
          origin?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_card_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "content_author"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "deal_card_log_changed_by_person_id_fkey"
            columns: ["changed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_card_log_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_card_log_origin_fkey"
            columns: ["origin"]
            isOneToOne: false
            referencedRelation: "deal_change_origin"
            referencedColumns: ["code"]
          },
        ]
      }
      deal_card_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      deal_change_input: {
        Row: {
          created_at: string
          deal_card_id: string
          id: string
          log_id: string
          note: string
          party_person_id: string
          submitted_at: string
        }
        Insert: {
          created_at?: string
          deal_card_id: string
          id?: string
          log_id: string
          note: string
          party_person_id: string
          submitted_at: string
        }
        Update: {
          created_at?: string
          deal_card_id?: string
          id?: string
          log_id?: string
          note?: string
          party_person_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_change_input_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_change_input_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "deal_card_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_change_input_party_person_id_fkey"
            columns: ["party_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_change_origin: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      deal_confirmation: {
        Row: {
          company_id: string
          created_at: string
          deal_card_id: string
          id: string
          note: string | null
          responded_at: string | null
          responding_person_id: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          deal_card_id: string
          id?: string
          note?: string | null
          responded_at?: string | null
          responding_person_id?: string | null
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          company_id?: string
          created_at?: string
          deal_card_id?: string
          id?: string
          note?: string | null
          responded_at?: string | null
          responding_person_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_confirmation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_confirmation_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_confirmation_responding_person_id_fkey"
            columns: ["responding_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_confirmation_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "deal_confirmation_status"
            referencedColumns: ["code"]
          },
        ]
      }
      deal_confirmation_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      deal_line_item: {
        Row: {
          cbd_percent: number | null
          created_at: string
          currency: string
          deal_card_id: string
          id: string
          line_total: number | null
          metadata: Json
          product_id: string | null
          product_name: string
          quantity: number
          sort_order: number
          thc_percent: number | null
          unit: string
          unit_price: number
          version: number
        }
        Insert: {
          cbd_percent?: number | null
          created_at?: string
          currency?: string
          deal_card_id: string
          id?: string
          line_total?: number | null
          metadata?: Json
          product_id?: string | null
          product_name: string
          quantity: number
          sort_order?: number
          thc_percent?: number | null
          unit: string
          unit_price: number
          version: number
        }
        Update: {
          cbd_percent?: number | null
          created_at?: string
          currency?: string
          deal_card_id?: string
          id?: string
          line_total?: number | null
          metadata?: Json
          product_id?: string | null
          product_name?: string
          quantity?: number
          sort_order?: number
          thc_percent?: number | null
          unit?: string
          unit_price?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_line_item_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_line_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_line_item_unit_fkey"
            columns: ["unit"]
            isOneToOne: false
            referencedRelation: "deal_line_unit"
            referencedColumns: ["code"]
          },
        ]
      }
      deal_line_item_private: {
        Row: {
          buyer_metric: number | null
          company_id: string
          created_at: string
          created_by: string | null
          deal_line_item_id: string
          id: string
          seller_margin: number | null
        }
        Insert: {
          buyer_metric?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deal_line_item_id: string
          id?: string
          seller_margin?: number | null
        }
        Update: {
          buyer_metric?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deal_line_item_id?: string
          id?: string
          seller_margin?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_line_item_private_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_line_item_private_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_line_item_private_deal_line_item_id_fkey"
            columns: ["deal_line_item_id"]
            isOneToOne: false
            referencedRelation: "deal_line_item"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_line_unit: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      deal_member: {
        Row: {
          added_at: string
          added_by_person_id: string
          created_at: string
          deal_workspace_id: string
          id: string
          metadata: Json
          person_id: string
          removed_at: string | null
          removed_by_person_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          added_by_person_id: string
          created_at?: string
          deal_workspace_id: string
          id?: string
          metadata?: Json
          person_id: string
          removed_at?: string | null
          removed_by_person_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          added_by_person_id?: string
          created_at?: string
          deal_workspace_id?: string
          id?: string
          metadata?: Json
          person_id?: string
          removed_at?: string | null
          removed_by_person_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_member_added_by_person_id_fkey"
            columns: ["added_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_member_deal_workspace_id_fkey"
            columns: ["deal_workspace_id"]
            isOneToOne: false
            referencedRelation: "deal_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_member_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_member_removed_by_person_id_fkey"
            columns: ["removed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_member_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "deal_member_role"
            referencedColumns: ["code"]
          },
        ]
      }
      deal_member_role: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      deal_party_field: {
        Row: {
          created_at: string
          created_by: string | null
          deal_card_id: string
          field_key: string
          field_label: string
          id: string
          metadata: Json
          owner_company_id: string
          party_side: string
          sort_order: number
          value_text: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_card_id: string
          field_key: string
          field_label: string
          id?: string
          metadata?: Json
          owner_company_id: string
          party_side: string
          sort_order?: number
          value_text?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_card_id?: string
          field_key?: string
          field_label?: string
          id?: string
          metadata?: Json
          owner_company_id?: string
          party_side?: string
          sort_order?: number
          value_text?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_party_field_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_party_field_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_party_field_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      deal_type: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      deal_workspace: {
        Row: {
          created_at: string
          created_by: string | null
          deal_card_id: string
          deleted_at: string | null
          id: string
          metadata: Json
          owner_person_id: string
          updated_at: string
          updated_by: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_card_id: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          owner_person_id: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_card_id?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          owner_person_id?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_workspace_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_workspace_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_workspace_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_workspace_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_workspace_visibility_fkey"
            columns: ["visibility"]
            isOneToOne: false
            referencedRelation: "workspace_visibility"
            referencedColumns: ["code"]
          },
        ]
      }
      file_scan_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      group: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          parent_group_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          parent_group_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_group_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "group"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      hs_team_member: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id: string
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id?: string
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hs_team_member_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hs_team_member_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hs_team_member_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_request_type: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      inbox_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      incoterms: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      irradiation_type: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      join_request: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          deleted_at: string | null
          id: string
          metadata: Json
          note: string | null
          rejection_reason: string | null
          requester_person_id: string
          status: string
          target_company_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          rejection_reason?: string | null
          requester_person_id: string
          status?: string
          target_company_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          rejection_reason?: string | null
          requester_person_id?: string
          status?: string
          target_company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_request_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_request_requester_person_id_fkey"
            columns: ["requester_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_request_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "join_request_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "join_request_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      join_request_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      note_scope: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      payment_terms: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      pending_inbox_item: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          created_at: string
          deal_card_id: string | null
          deleted_at: string | null
          id: string
          metadata: Json
          note: string | null
          receiver_company_id: string
          sender_company_id: string
          sender_person_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          deal_card_id?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          receiver_company_id: string
          sender_company_id: string
          sender_person_id: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          deal_card_id?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          receiver_company_id?: string
          sender_company_id?: string
          sender_person_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_inbox_item_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_inbox_item_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_inbox_item_deal_card_id_fkey"
            columns: ["deal_card_id"]
            isOneToOne: false
            referencedRelation: "deal_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_inbox_item_receiver_company_id_fkey"
            columns: ["receiver_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_inbox_item_sender_company_id_fkey"
            columns: ["sender_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_inbox_item_sender_person_id_fkey"
            columns: ["sender_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_inbox_item_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "inbox_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pending_inbox_item_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "inbox_request_type"
            referencedColumns: ["code"]
          },
        ]
      }
      permission_action: {
        Row: {
          category: string | null
          code: string
          description: string
        }
        Insert: {
          category?: string | null
          code: string
          description: string
        }
        Update: {
          category?: string | null
          code?: string
          description?: string
        }
        Relationships: []
      }
      permission_matrix_entry: {
        Row: {
          action: string
          company_id: string
          created_at: string
          created_by: string | null
          granted: boolean
          group_id: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          created_by?: string | null
          granted?: boolean
          group_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          granted?: boolean
          group_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_matrix_entry_action_fkey"
            columns: ["action"]
            isOneToOne: false
            referencedRelation: "permission_action"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "permission_matrix_entry_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_matrix_entry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_matrix_entry_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_matrix_entry_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      person: {
        Row: {
          avatar_path: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          first_name: string
          id: string
          language: string | null
          last_name: string
          links: Json
          metadata: Json
          phone: string | null
          preferences: Json
          public_handle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name: string
          id: string
          language?: string | null
          last_name: string
          links?: Json
          metadata?: Json
          phone?: string | null
          preferences?: Json
          public_handle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name?: string
          id?: string
          language?: string | null
          last_name?: string
          links?: Json
          metadata?: Json
          phone?: string | null
          preferences?: Json
          public_handle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      person_group: {
        Row: {
          created_at: string
          deleted_at: string | null
          group_id: string | null
          id: string
          person_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          group_id?: string | null
          id?: string
          person_id: string
          role?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          group_id?: string | null
          id?: string
          person_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_group_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_group_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelist: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          metadata: Json
          name: string
          published_at: string | null
          status_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          name: string
          published_at?: string | null
          status_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          name?: string
          published_at?: string | null
          status_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricelist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_status_code_fkey"
            columns: ["status_code"]
            isOneToOne: false
            referencedRelation: "pricelist_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pricelist_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelist_item: {
        Row: {
          bundle_price_per_gram: number | null
          bundle_threshold_grams: number | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          metadata: Json
          price_per_gram: number
          pricelist_id: string
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bundle_price_per_gram?: number | null
          bundle_threshold_grams?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          price_per_gram: number
          pricelist_id: string
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bundle_price_per_gram?: number | null
          bundle_threshold_grams?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          price_per_gram?: number
          pricelist_id?: string
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricelist_item_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_item_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_item_pricelist_id_fkey"
            columns: ["pricelist_id"]
            isOneToOne: false
            referencedRelation: "pricelist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_item_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelist_status: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      product: {
        Row: {
          bundle_description: string | null
          cbd_percent: number | null
          cbg_percent: number | null
          cbn_percent: number | null
          company_id: string
          country_of_origin: string | null
          created_at: string
          created_by: string | null
          cultivar: string | null
          cultivator: string | null
          deleted_at: string | null
          deleted_by: string | null
          dominance_code: string | null
          id: string
          irradiation_code: string | null
          lineage_parent_a: string | null
          lineage_parent_b: string | null
          local_code_pzn: string | null
          metadata: Json
          name: string
          pack_size_grams: number | null
          packaging_material: string | null
          price_public: boolean
          region: string | null
          resealable: boolean | null
          rrp_per_gram: number | null
          supplier_product_code: string | null
          thc_percent: number | null
          unit_code: string
          updated_at: string
          updated_by: string | null
          visibility_end: string | null
          visibility_start: string | null
        }
        Insert: {
          bundle_description?: string | null
          cbd_percent?: number | null
          cbg_percent?: number | null
          cbn_percent?: number | null
          company_id: string
          country_of_origin?: string | null
          created_at?: string
          created_by?: string | null
          cultivar?: string | null
          cultivator?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dominance_code?: string | null
          id?: string
          irradiation_code?: string | null
          lineage_parent_a?: string | null
          lineage_parent_b?: string | null
          local_code_pzn?: string | null
          metadata?: Json
          name: string
          pack_size_grams?: number | null
          packaging_material?: string | null
          price_public?: boolean
          region?: string | null
          resealable?: boolean | null
          rrp_per_gram?: number | null
          supplier_product_code?: string | null
          thc_percent?: number | null
          unit_code?: string
          updated_at?: string
          updated_by?: string | null
          visibility_end?: string | null
          visibility_start?: string | null
        }
        Update: {
          bundle_description?: string | null
          cbd_percent?: number | null
          cbg_percent?: number | null
          cbn_percent?: number | null
          company_id?: string
          country_of_origin?: string | null
          created_at?: string
          created_by?: string | null
          cultivar?: string | null
          cultivator?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dominance_code?: string | null
          id?: string
          irradiation_code?: string | null
          lineage_parent_a?: string | null
          lineage_parent_b?: string | null
          local_code_pzn?: string | null
          metadata?: Json
          name?: string
          pack_size_grams?: number | null
          packaging_material?: string | null
          price_public?: boolean
          region?: string | null
          resealable?: boolean | null
          rrp_per_gram?: number | null
          supplier_product_code?: string | null
          thc_percent?: number | null
          unit_code?: string
          updated_at?: string
          updated_by?: string | null
          visibility_end?: string | null
          visibility_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_dominance_code_fkey"
            columns: ["dominance_code"]
            isOneToOne: false
            referencedRelation: "strain_dominance"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_irradiation_code_fkey"
            columns: ["irradiation_code"]
            isOneToOne: false
            referencedRelation: "irradiation_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_unit_code_fkey"
            columns: ["unit_code"]
            isOneToOne: false
            referencedRelation: "product_unit"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batch: {
        Row: {
          batch_number: string
          cbd_percent: number | null
          cbg_percent: number | null
          cbn_percent: number | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          expiry_date: string | null
          id: string
          loss_on_drying_percent: number | null
          metadata: Json
          product_id: string
          ready_for_sale_date: string | null
          shelf_life_months: number | null
          thc_percent: number | null
          updated_at: string
          updated_by: string | null
          water_activity: number | null
        }
        Insert: {
          batch_number: string
          cbd_percent?: number | null
          cbg_percent?: number | null
          cbn_percent?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          expiry_date?: string | null
          id?: string
          loss_on_drying_percent?: number | null
          metadata?: Json
          product_id: string
          ready_for_sale_date?: string | null
          shelf_life_months?: number | null
          thc_percent?: number | null
          updated_at?: string
          updated_by?: string | null
          water_activity?: number | null
        }
        Update: {
          batch_number?: string
          cbd_percent?: number | null
          cbg_percent?: number | null
          cbn_percent?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          expiry_date?: string | null
          id?: string
          loss_on_drying_percent?: number | null
          metadata?: Json
          product_id?: string
          ready_for_sale_date?: string | null
          shelf_life_months?: number | null
          thc_percent?: number | null
          updated_at?: string
          updated_by?: string | null
          water_activity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batch_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batch_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batch_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batch_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batch_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      product_buyer_code: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          product_id: string
          relationship_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          product_id: string
          relationship_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          product_id?: string
          relationship_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_buyer_code_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_buyer_code_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_buyer_code_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationship"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_buyer_code_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      product_cost: {
        Row: {
          cogs: number | null
          company_id: string
          created_at: string
          created_by: string | null
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cogs?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cogs?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_cost_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      product_image: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image_path: string
          position: number
          product_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          image_path: string
          position?: number
          product_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image_path?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_image_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_image_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
        ]
      }
      product_unit: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      relationship: {
        Row: {
          company_a_id: string
          company_b_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          inbox_item_id: string | null
          initiated_by_company_id: string
          metadata: Json
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_a_id: string
          company_b_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inbox_item_id?: string | null
          initiated_by_company_id: string
          metadata?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_a_id?: string
          company_b_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inbox_item_id?: string | null
          initiated_by_company_id?: string
          metadata?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationship_company_a_id_fkey"
            columns: ["company_a_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_company_b_id_fkey"
            columns: ["company_b_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_inbox_item_id_fkey"
            columns: ["inbox_item_id"]
            isOneToOne: false
            referencedRelation: "pending_inbox_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_initiated_by_company_id_fkey"
            columns: ["initiated_by_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "relationship_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "relationship_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_artifact: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          file_size_bytes: number
          id: string
          metadata: Json
          mime_type: string
          original_filename: string
          relationship_id: string
          scan_status: string
          storage_path: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_by_company_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_size_bytes: number
          id?: string
          metadata?: Json
          mime_type: string
          original_filename: string
          relationship_id: string
          scan_status?: string
          storage_path: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by_company_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_size_bytes?: number
          id?: string
          metadata?: Json
          mime_type?: string
          original_filename?: string
          relationship_id?: string
          scan_status?: string
          storage_path?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_artifact_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "artifact_category"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "relationship_artifact_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_artifact_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_artifact_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationship"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_artifact_scan_status_fkey"
            columns: ["scan_status"]
            isOneToOne: false
            referencedRelation: "file_scan_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "relationship_artifact_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_artifact_uploaded_by_company_id_fkey"
            columns: ["uploaded_by_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_note: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          metadata: Json
          relationship_id: string
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json
          relationship_id: string
          scope: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json
          relationship_id?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationship_note_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_note_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_note_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationship"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_note_scope_fkey"
            columns: ["scope"]
            isOneToOne: false
            referencedRelation: "note_scope"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "relationship_note_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      relationship_term: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          metadata: Json
          proposed_at: string
          proposed_by_company_id: string
          proposed_by_person_id: string
          relationship_id: string
          responded_at: string | null
          responded_by_person_id: string | null
          response_note: string | null
          status: string
          superseded_at: string | null
          superseded_by_id: string | null
          term_type_code: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          proposed_at?: string
          proposed_by_company_id: string
          proposed_by_person_id: string
          relationship_id: string
          responded_at?: string | null
          responded_by_person_id?: string | null
          response_note?: string | null
          status?: string
          superseded_at?: string | null
          superseded_by_id?: string | null
          term_type_code: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          proposed_at?: string
          proposed_by_company_id?: string
          proposed_by_person_id?: string
          relationship_id?: string
          responded_at?: string | null
          responded_by_person_id?: string | null
          response_note?: string | null
          status?: string
          superseded_at?: string | null
          superseded_by_id?: string | null
          term_type_code?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_term_proposed_by_company_id_fkey"
            columns: ["proposed_by_company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_term_proposed_by_person_id_fkey"
            columns: ["proposed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_term_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationship"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_term_responded_by_person_id_fkey"
            columns: ["responded_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_term_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "relationship_term_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "relationship_term_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "relationship_term"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_term_term_type_code_fkey"
            columns: ["term_type_code"]
            isOneToOne: false
            referencedRelation: "agreed_term_type"
            referencedColumns: ["code"]
          },
        ]
      }
      relationship_term_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      strain_dominance: {
        Row: {
          code: string
          description: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          sort_order?: number
        }
        Relationships: []
      }
      terpene: {
        Row: {
          aroma_description: string | null
          code: string
          name: string
        }
        Insert: {
          aroma_description?: string | null
          code: string
          name: string
        }
        Update: {
          aroma_description?: string | null
          code?: string
          name?: string
        }
        Relationships: []
      }
      thing: {
        Row: {
          assignee_person_id: string | null
          completed_at: string | null
          completed_by_person_id: string | null
          created_at: string
          created_by: string | null
          deal_workspace_id: string
          deleted_at: string | null
          description: string | null
          due_at: string | null
          id: string
          linked_artifact_id: string | null
          linked_confirmation_id: string | null
          metadata: Json
          sort_order: number
          stage_code: string
          status: string
          title: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_person_id?: string | null
          completed_at?: string | null
          completed_by_person_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_workspace_id: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          linked_artifact_id?: string | null
          linked_confirmation_id?: string | null
          metadata?: Json
          sort_order?: number
          stage_code: string
          status?: string
          title: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_person_id?: string | null
          completed_at?: string | null
          completed_by_person_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_workspace_id?: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          linked_artifact_id?: string | null
          linked_confirmation_id?: string | null
          metadata?: Json
          sort_order?: number
          stage_code?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thing_assignee_person_id_fkey"
            columns: ["assignee_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thing_completed_by_person_id_fkey"
            columns: ["completed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thing_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thing_deal_workspace_id_fkey"
            columns: ["deal_workspace_id"]
            isOneToOne: false
            referencedRelation: "deal_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thing_linked_artifact_id_fkey"
            columns: ["linked_artifact_id"]
            isOneToOne: false
            referencedRelation: "deal_artifact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thing_linked_confirmation_id_fkey"
            columns: ["linked_confirmation_id"]
            isOneToOne: false
            referencedRelation: "deal_confirmation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thing_stage_code_fkey"
            columns: ["stage_code"]
            isOneToOne: false
            referencedRelation: "deal_stage"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "thing_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "thing_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "thing_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "thing_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "thing_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      thing_status: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      thing_type: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      workspace_visibility: {
        Row: {
          code: string
          description: string
          is_terminal: boolean
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          is_terminal?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string
          is_terminal?: boolean
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_thread: { Args: { p_thread_id: string }; Returns: boolean }
      can_access_workspace: { Args: { p_ws_id: string }; Returns: boolean }
      can_see_person: {
        Args: { p_company_id: string; p_person_id: string }
        Returns: boolean
      }
      card_relationship_member: {
        Args: { p_card_id: string }
        Returns: boolean
      }
      current_company_id: { Args: never; Returns: string }
      import_products: { Args: { p_rows: Json }; Returns: Json }
      is_hs_team: { Args: never; Returns: boolean }
      is_relationship_member: { Args: { p_rel_id: string }; Returns: boolean }
      is_workspace_member: { Args: { p_ws_id: string }; Returns: boolean }
      onboard_company: {
        Args: { p_country: string; p_name: string; p_type_codes?: string[] }
        Returns: string
      }
      owns_group: { Args: { p_group_id: string }; Returns: boolean }
      owns_pricelist: { Args: { p_pricelist_id: string }; Returns: boolean }
      owns_product_batch: { Args: { p_batch_id: string }; Returns: boolean }
      shares_connection_with_company: {
        Args: { p_company_id: string }
        Returns: boolean
      }
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
