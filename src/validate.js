const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function validateTitle(title) {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return null;
  return trimmed;
}

export function validateRunId(runId) {
  if (typeof runId !== 'string') return false;
  return RUN_ID_RE.test(runId);
}

export function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}