// =========================================================================
//  Supabase client + cloud storage adapter
//  -------------------------------------------------------------------------
//  This module replaces the localStorage-based persistence layer.
//  It exposes the same shape (storageGet / storageSet) that the dashboard
//  used before, but talks to a remote Postgres instead of the browser.
// =========================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Surface a clear error early if env vars are missing rather than silently
// failing on the first network call.
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// =========================================================================
//  Schema mappers
//  Convert between the front-end's camelCase shape and the database's
//  snake_case columns. Keeps the rest of the app oblivious to DB conventions.
// =========================================================================

function staffRowToObject(row) {
  return {
    id: row.id,
    display: row.display,
    fullName: row.full_name || "",
    role: row.role,
    primary: row.primary_location,
    eligible: Array.isArray(row.eligible) ? row.eligible : [],
    notes: row.notes || "",
  };
}

function staffObjectToRow(s) {
  return {
    id: s.id,
    display: s.display,
    full_name: s.fullName || null,
    role: s.role,
    primary_location: s.primary,
    eligible: s.eligible || [],
    notes: s.notes || null,
  };
}

// =========================================================================
//  Public API
// =========================================================================

export async function loadAllStaff() {
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .order("display");
  if (error) throw error;
  return (data || []).map(staffRowToObject);
}

export async function saveAllStaff(staffArray) {
  // Replace-all semantics. Delete rows that no longer exist, upsert the rest.
  const { data: existing, error: e1 } = await supabase
    .from("staff")
    .select("id");
  if (e1) throw e1;
  const newIds = new Set(staffArray.map((s) => s.id));
  const toDelete = (existing || []).filter((r) => !newIds.has(r.id)).map((r) => r.id);

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from("staff").delete().in("id", toDelete);
    if (delErr) throw delErr;
  }

  if (staffArray.length > 0) {
    const rows = staffArray.map(staffObjectToRow);
    const { error: upErr } = await supabase.from("staff").upsert(rows, { onConflict: "id" });
    if (upErr) throw upErr;
  }
}

export async function loadAllRules() {
  const { data, error } = await supabase.from("rules").select("*");
  if (error) throw error;
  const out = { roomOwners: {}, rotationOrders: {} };
  (data || []).forEach((row) => {
    out.roomOwners[row.location] = row.room_owners || {};
    out.rotationOrders[row.location] = row.rotation_orders || {};
  });
  return out;
}

export async function saveAllRules(rules) {
  const locations = new Set([
    ...Object.keys(rules.roomOwners || {}),
    ...Object.keys(rules.rotationOrders || {}),
  ]);
  const rows = Array.from(locations).map((loc) => ({
    location: loc,
    room_owners: rules.roomOwners?.[loc] || {},
    rotation_orders: rules.rotationOrders?.[loc] || {},
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("rules").upsert(rows, { onConflict: "location" });
  if (error) throw error;
}

export async function loadAllSchedules() {
  const { data, error } = await supabase.from("schedules").select("*");
  if (error) throw error;
  // Reshape rows into { [week]: { [location]: data } }
  const out = {};
  (data || []).forEach((row) => {
    if (!out[row.week]) out[row.week] = {};
    out[row.week][row.location] = row.data;
  });
  return out;
}

export async function saveOneSchedule(week, location, data) {
  const { error } = await supabase
    .from("schedules")
    .upsert({ week, location, data }, { onConflict: "week,location" });
  if (error) throw error;
}

export async function deleteSchedule(week, location) {
  const { error } = await supabase
    .from("schedules")
    .delete()
    .eq("week", week)
    .eq("location", location);
  if (error) throw error;
}

// =========================================================================
//  Time-off (staff out-of-office periods)
// =========================================================================

function timeOffRowToObject(row) {
  return {
    id: row.id,
    staffId: row.staff_id,
    startDate: row.start_date,    // 'YYYY-MM-DD'
    endDate: row.end_date,        // 'YYYY-MM-DD'
    reason: row.reason || "",
  };
}

export async function loadAllTimeOff() {
  const { data, error } = await supabase
    .from("time_off")
    .select("*")
    .order("start_date");
  if (error) throw error;
  return (data || []).map(timeOffRowToObject);
}

export async function addTimeOff(staffId, startDate, endDate, reason = "") {
  const { data, error } = await supabase
    .from("time_off")
    .insert({
      staff_id: staffId,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
    })
    .select()
    .single();
  if (error) throw error;
  return timeOffRowToObject(data);
}

export async function deleteTimeOff(id) {
  const { error } = await supabase.from("time_off").delete().eq("id", id);
  if (error) throw error;
}

// =========================================================================
//  Realtime subscriptions
//  Each returns an unsubscribe function.
// =========================================================================

export function subscribeStaff(onChange) {
  const channel = supabase
    .channel("staff-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "staff" },
      () => onChange()
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeRules(onChange) {
  const channel = supabase
    .channel("rules-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rules" },
      () => onChange()
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeTimeOff(onChange) {
  const channel = supabase
    .channel("time-off-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "time_off" },
      () => onChange()
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeSchedules(onChange) {
  const channel = supabase
    .channel("schedules-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "schedules" },
      (payload) => onChange(payload)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// =========================================================================
//  Auth helpers
// =========================================================================

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session, event);
  });
  return () => data.subscription.unsubscribe();
}

// Send a password-reset email. Supabase emails the user a link that
// returns to the dashboard with a recovery token in the URL hash.
export async function requestPasswordReset(email) {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/`
      : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

// Called from the reset-password screen, after the user lands on the page
// with a recovery session active (Supabase auto-establishes it from the URL).
export async function updateUserPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
