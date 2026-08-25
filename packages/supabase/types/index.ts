export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ============================================================
// Core Entity Types
// ============================================================

export interface Hotel {
  id: string
  name: string
  address: string | null
  phone: string | null
  logo_url: string | null
  color_scheme: string | null
  created_at: string
}

export interface Room {
  id: string
  hotel_id: string
  room_number: string
  floor: string | null
  room_type: 'STANDARD' | 'DELUXE' | 'SUITE' | 'PENTHOUSE'
  qr_auth_hash: string
  is_active: boolean
  created_at: string
}

export interface GuestSession {
  id: string
  room_id: string
  hotel_id: string
  phone_number: string | null
  status: 'ACTIVE' | 'EXPIRED' | 'CHECKED_OUT'
  created_at: string
  expires_at: string
}

export interface RequestItem {
  id: string
  hotel_id: string
  room_id: string
  request_type: 'CALL_REQUEST' | 'SPA_BOOKING' | 'FOOD_ORDER' | 'TASK' | string
  status: 'PENDING' | 'PENDING_ON_CALL' | 'CLAIMED' | 'CONFIRMED' | 'DECLINED' | 'PREPARING' | 'RESOLVED' | 'CANCELLED' | 'ESCALATED_L1'
  payload: Json
  created_at: string
  claimed_at: string | null
  claimed_by: string | null
}

export type DietaryTag = 'VEGETARIAN' | 'VEGAN' | 'GLUTEN_FREE' | 'HALAL' | 'NUT_FREE' | 'DAIRY_FREE'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type TargetDepartment = 'HOUSEKEEPING' | 'MAINTENANCE' | 'FRONT_DESK'

export interface CatalogItem {
  id: string
  hotel_id: string
  department: 'SPA' | 'F_AND_B' | 'ROOM_REQUEST'
  category: string | null
  name: string
  description: string | null
  price: number
  duration_mins: number | null
  requires_on_call: boolean
  is_available: boolean
  dietary_tags: string[]
  sort_order: number
  image_url: string | null
  // Phase 4: Task routing fields
  priority: TaskPriority | null
  target_sla_mins: number | null
  target_department: TargetDepartment | null
  created_at: string
}

export type StaffRole = 'FRONT_DESK' | 'KITCHEN' | 'HOUSEKEEPING' | 'SPA' | 'MANAGER'

export interface StaffUser {
  id: string
  hotel_id: string
  full_name: string
  email: string
  password?: string
  role: StaffRole
  is_active: boolean
  created_at: string
}

// ── F&B Cart Types ────────────────────────────────────────────

export interface CartItem {
  item: CatalogItem
  quantity: number
  special_instructions?: string
}

export type FulfillmentType = 'ROOM_SERVICE' | 'DINE_IN'
export type DeliveryPreference = 'HAND_TO_ME' | 'LEAVE_AT_DOOR'
export type ArrivalTime = 'IN_15_MINS' | 'IN_30_MINS' | 'IN_60_MINS' | 'CUSTOM'

export interface FoodOrderPayload {
  order_type: FulfillmentType
  items: Array<{ id: string; name: string; quantity: number; unit_price: number }>
  special_instructions: string
  delivery_preference?: DeliveryPreference  // Room Service only
  target_arrival_time?: ArrivalTime          // Dine-In only
  total_price: number
}

// ── Task Request Types ──────────────────────────────────────

export interface TaskPayload {
  task_name: string
  quantity: number
  custom_notes: string
  priority: TaskPriority
  target_department: TargetDepartment
  catalog_item_id?: string
  is_custom?: boolean
}

export interface SlaEscalation {
  id: string
  request_id: string
  escalation_level: number
  triggered_at: string
}

export interface AuditLog {
  id: string
  hotel_id: string
  request_id: string | null
  action: string
  actor_id: string | null
  details: Json
  created_at: string
}

export interface Therapist {
  id: string
  hotel_id: string
  full_name: string
  is_on_call: boolean
  is_active: boolean
  created_at: string
}

export interface SpaSlotLock {
  id: string
  hotel_id: string
  therapist_id: string | null
  request_id: string | null
  session_id: string | null
  start_time: string
  end_time: string
  status: 'HELD' | 'BOOKED' | 'EXPIRED' | 'CANCELLED'
  expires_at: string
  created_at: string
}

// ============================================================
// Joined / Extended Types (for queries with relations)
// ============================================================

export interface RoomWithHotel extends Room {
  hotel: Hotel
}

export interface GuestSessionWithRoom extends GuestSession {
  room: RoomWithHotel
}

export interface RequestWithRoom extends RequestItem {
  rooms?: Room | null
  hotels?: Hotel | null
}

// ============================================================
// QR URL Parameters
// ============================================================

export interface QRParams {
  room: string   // room UUID
  hash: string   // qr_auth_hash
}

// ============================================================
// API Response Wrappers
// ============================================================

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

// ============================================================
// Supabase Database Shape (for createClient generic)
// ============================================================

export interface Database {
  public: {
    Tables: {
      hotels: {
        Row: Hotel
        Insert: Omit<Hotel, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Hotel, 'id'>>
      }
      rooms: {
        Row: Room
        Insert: Omit<Room, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Room, 'id'>>
      }
      guest_sessions: {
        Row: GuestSession
        Insert: Omit<GuestSession, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<GuestSession, 'id'>>
      }
      requests: {
        Row: RequestItem
        Insert: {
          id?: string
          hotel_id: string
          room_id: string
          request_type: string
          status: string
          payload?: Json
          created_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
        }
        Update: {
          hotel_id?: string
          room_id?: string
          request_type?: string
          status?: string
          payload?: Json
          claimed_at?: string | null
          claimed_by?: string | null
        }
      }
      catalog_items: {
        Row: CatalogItem
        Insert: {
          id?: string
          hotel_id: string
          department: 'SPA' | 'F_AND_B' | 'ROOM_REQUEST'
          category?: string | null
          name: string
          description?: string | null
          price: number
          duration_mins?: number | null
          requires_on_call?: boolean
          is_available?: boolean
          dietary_tags?: string[]
          sort_order?: number
          image_url?: string | null
          priority?: TaskPriority | null
          target_sla_mins?: number | null
          target_department?: TargetDepartment | null
          created_at?: string
        }
        Update: {
          department?: 'SPA' | 'F_AND_B' | 'ROOM_REQUEST'
          category?: string | null
          name?: string
          description?: string | null
          price?: number
          duration_mins?: number | null
          requires_on_call?: boolean
          is_available?: boolean
          dietary_tags?: string[]
          sort_order?: number
          image_url?: string | null
          priority?: TaskPriority | null
          target_sla_mins?: number | null
          target_department?: TargetDepartment | null
        }
      }
      therapists: {
        Row: Therapist
        Insert: Omit<Therapist, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Therapist, 'id'>>
      }
      spa_slot_locks: {
        Row: SpaSlotLock
        Insert: Omit<SpaSlotLock, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<SpaSlotLock, 'id'>>
      }
      sla_escalations: {
        Row: SlaEscalation
        Insert: Omit<SlaEscalation, 'id' | 'triggered_at'> & { id?: string; triggered_at?: string }
        Update: Partial<Omit<SlaEscalation, 'id'>>
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<AuditLog, 'id'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      session_status: 'ACTIVE' | 'EXPIRED' | 'CHECKED_OUT'
      room_type: 'STANDARD' | 'DELUXE' | 'SUITE' | 'PENTHOUSE'
      request_status: 'PENDING' | 'PENDING_ON_CALL' | 'CLAIMED' | 'CONFIRMED' | 'DECLINED' | 'PREPARING' | 'RESOLVED' | 'CANCELLED' | 'ESCALATED_L1'
      department_type: 'SPA' | 'F_AND_B' | 'ROOM_REQUEST'
      slot_lock_status: 'HELD' | 'BOOKED' | 'EXPIRED' | 'CANCELLED'
    }
  }
}
