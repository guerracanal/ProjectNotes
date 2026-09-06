import { randomUUID } from 'crypto';

/**
 * Process-wide job registry shared by the transcription and summarisation
 * routes. Each API route module used to keep its own Map, so a job started by
 * one route was invisible to the other and pollers could 404 forever.
 *
 * Jobs live in memory only: a server restart clears them. They are also capped
 * and pruned so a long-running dev server does not leak.
 */

const MAX_JOBS = 200;
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

const globalKey = Symbol.for('projectnotes.jobs');
if (!globalThis[globalKey]) {
  globalThis[globalKey] = new Map();
}

/** @type {Map<string, object>} */
const jobs = globalThis[globalKey];

function prune() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const finished = job.endTime ? new Date(job.endTime).getTime() : null;
    if (finished && now - finished > TTL_MS) jobs.delete(id);
  }
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value;
    jobs.delete(oldest);
  }
}

export function createJob(type, payload = {}) {
  prune();
  const id = `${type}_${randomUUID()}`;
  jobs.set(id, {
    id,
    type,
    status: 'pending',
    progress: null,
    startTime: new Date().toISOString(),
    endTime: null,
    error: null,
    stdout: '',
    stderr: '',
    ...payload,
  });
  return id;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  const next = { ...job, ...patch };
  jobs.set(id, next);
  return next;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs(type) {
  const all = [...jobs.values()];
  return type ? all.filter((j) => j.type === type) : all;
}
