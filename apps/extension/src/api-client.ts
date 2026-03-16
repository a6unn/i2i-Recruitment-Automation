import type {
  ApiResponse,
  BatchScoreRequest,
  BatchScoreResponse,
  HybridScoreRequest,
  HybridScoreResponse,
  ActiveJD,
  ExtensionUser,
} from '@recruitment/shared';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3002';

async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('auth');
  return result.auth?.token ?? null;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getToken();
  console.log(`API: ${options.method || 'GET'} ${path} | token: ${token ? token.slice(0, 20) + '...' : 'NONE'}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    console.log(`API: ${path} → ${res.status}`);
    if (!res.ok) {
      const text = await res.text();
      console.error(`API: ${path} error body:`, text.slice(0, 200));
      try {
        return JSON.parse(text);
      } catch {
        return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 100)}` } as ApiResponse<T>;
      }
    }
    return res.json();
  } catch (err) {
    console.error(`API: ${path} fetch error:`, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) } as ApiResponse<T>;
  }
}

export async function login(
  email: string,
  password: string
): Promise<ApiResponse<{ token: string; user: ExtensionUser }>> {
  return apiFetch('/api/extension/auth', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getJDs(): Promise<
  ApiResponse<{ id: string; title: string; clientName?: string; status: string; parsedData: unknown }[]>
> {
  return apiFetch('/api/jds');
}

export async function getJD(id: string): Promise<ApiResponse<ActiveJD>> {
  return apiFetch(`/api/jds/${id}`);
}

export async function scoreProfiles(
  req: BatchScoreRequest
): Promise<ApiResponse<BatchScoreResponse>> {
  return apiFetch('/api/candidates/score', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function scoreProfilesHybrid(
  req: HybridScoreRequest
): Promise<ApiResponse<HybridScoreResponse>> {
  return apiFetch('/api/candidates/score', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function shortlistCandidates(
  candidateIds: string[]
): Promise<ApiResponse<{ updated: number }>> {
  return apiFetch('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({ candidateIds, pipelineStatus: 'SHORTLISTED' }),
  });
}

export async function addNote(
  candidateId: string,
  content: string
): Promise<ApiResponse<{ id: string }>> {
  return apiFetch(`/api/candidates/${candidateId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function exportCsv(jdId: string): Promise<Blob> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/api/candidates/export?jdId=${jdId}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  return res.blob();
}
