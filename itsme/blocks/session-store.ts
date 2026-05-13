export type ProjDocId = `${string}-${string}`;

export type HistoryOp = {
  up: () => void;
  down: () => void;
};

type HistoryState = {
  ops: HistoryOp[];
  cursor: number;
};

const history = new Map<ProjDocId, HistoryState>();

function getOrCreateHistoryState(projDocId: ProjDocId): HistoryState {
  const existing = history.get(projDocId);
  if (existing) {
    return existing;
  }

  const next: HistoryState = {
    ops: [],
    cursor: 0,
  };
  history.set(projDocId, next);
  return next;
}

export function makeProjDocId(
  projectId: string | null,
  documentId: string
): ProjDocId {
  return `${projectId ?? "no-project"}-${documentId}` as ProjDocId;
}

export function pushHistoryOp(projDocId: ProjDocId, op: HistoryOp): void {
  const state = getOrCreateHistoryState(projDocId);
  if (state.cursor < state.ops.length) {
    state.ops.splice(state.cursor);
  }
  state.ops.push(op);
  state.cursor = state.ops.length;
}

export function undoHistory(projDocId: ProjDocId): boolean {
  const state = history.get(projDocId);
  if (!state || state.cursor === 0) {
    return false;
  }

  const nextCursor = state.cursor - 1;
  const op = state.ops[nextCursor];
  if (!op) {
    return false;
  }

  state.cursor = nextCursor;
  try {
    op.down();
    return true;
  } catch (error) {
    state.cursor += 1;
    throw error;
  }
}

export function redoHistory(projDocId: ProjDocId): boolean {
  const state = history.get(projDocId);
  if (!state || state.cursor >= state.ops.length) {
    return false;
  }

  const op = state.ops[state.cursor];
  if (!op) {
    return false;
  }

  state.cursor += 1;
  try {
    op.up();
    return true;
  } catch (error) {
    state.cursor -= 1;
    throw error;
  }
}
