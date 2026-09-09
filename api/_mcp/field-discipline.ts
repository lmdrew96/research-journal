/**
 * Shared guidance appended to the tool descriptions that accept free text.
 *
 * Every field has one job, and content belonging to another field goes there
 * instead. Fields whose name implies a purpose but whose description does not
 * state a boundary absorb whatever is nearby — a question's `why` collects the
 * study design, an article's `abstract` collects editorial commentary.
 *
 * Deliberately not enforced server-side. A character limit would truncate the
 * fields where long-form is correct (`design`, journal `content`), and the
 * failure mode here is drift, not overflow. This is guidance, not gatekeeping.
 *
 * Length guidance lives on individual fields and is always phrased as a target,
 * never a hard count — given "under 50 words" an agent pads or truncates to hit
 * it rather than writing the right amount.
 */
export const FIELD_DISCIPLINE =
  'Field discipline: the short structured fields each state one thing, and notes and journal ' +
  'entries carry long-form reasoning. If what you are writing does not fit a field\'s stated ' +
  'job, it belongs in a note rather than stretched to fit.';
