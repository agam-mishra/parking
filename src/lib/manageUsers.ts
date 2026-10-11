import { supabase } from './supabase'

// Calls the manage-users edge function; throws with the function's error code.
export async function manageUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-users', { body })
  if (error) {
    let code = error.message
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? code } catch { /* not json */ }
    throw new Error(code)
  }
  return data
}
