-- A succeeded payment whose amount does not match the booking total is refunded and the booking cancelled.
ALTER TYPE "cancel_reason" ADD VALUE 'AMOUNT_MISMATCH_REFUNDED';
