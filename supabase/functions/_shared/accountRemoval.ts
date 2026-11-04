/**
 * What to tell a guest when `begin_account_removal()` says no. Pure and in its own file so it can be
 * tested without Deno or a live Supabase. An answer this file does not know is refused as an error,
 * never treated as permission: only the exact string `ok` proceeds (the caller checks that first).
 */

export interface RemovalRefusal {
  status: 409 | 500;
  message: string;
}

export function removalRefusal(answer: unknown): RemovalRefusal {
  switch (answer) {
    case 'disabled':
      return { status: 409, message: 'Removing your sign-in is not available yet. Your data has been erased.' };
    case 'not_erased':
      return { status: 409, message: 'Erase your data first, then remove your sign-in.' };
    case 'has_bookings':
      return { status: 409, message: 'Your bookings must be kept by law, so your sign-in stays.' };
    case 'not_tourist':
      return { status: 409, message: 'This account cannot be removed here.' };
    default:
      return { status: 500, message: 'Could not remove your sign-in right now' };
  }
}
