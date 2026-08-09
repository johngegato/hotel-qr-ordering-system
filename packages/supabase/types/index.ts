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
  request_type: 'CALL_REQUEST' | 'TASK' | string
  status: 'PENDING' | 'CLAIMED' | 'RESOLVED' | 'CANCELLED'
  payload: Json
  created_at: string
  claimed_at: string | null
  claimed_by: string | null
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
        Insert: Omit<RequestItem, 'id' | 'created_at' | 'claimed_at' | 'claimed_by'> & {
          id?: string
          created_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
        }
        Update: Partial<Omit<RequestItem, 'id'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      session_status: 'ACTIVE' | 'EXPIRED' | 'CHECKED_OUT'
      room_type: 'STANDARD' | 'DELUXE' | 'SUITE' | 'PENTHOUSE'
      request_status: 'PENDING' | 'CLAIMED' | 'RESOLVED' | 'CANCELLED'
    }
  }
}
