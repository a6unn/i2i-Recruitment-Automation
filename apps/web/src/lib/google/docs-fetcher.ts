/**
 * Fetches text content from a public Google Docs URL.
 * Uses the /export?format=txt endpoint which works for publicly shared docs.
 */
export async function fetchGoogleDocText(url: string): Promise<string> {
  // Extract document ID from various Google Docs URL formats
  const docId = extractDocId(url);
  if (!docId) {
    throw new Error(
      'Invalid Google Docs URL. Expected format: https://docs.google.com/document/d/{docId}/...'
    );
  }

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

  const response = await fetch(exportUrl, {
    headers: {
      'User-Agent': 'RecruitmentAutomation/1.0',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Google Doc not found. Check the URL and sharing settings.');
    }
    if (response.status === 403) {
      throw new Error(
        'Cannot access this Google Doc. Make sure it is shared as "Anyone with the link can view".'
      );
    }
    throw new Error(`Failed to fetch Google Doc: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error('Google Doc appears to be empty.');
  }

  return text;
}

function extractDocId(url: string): string | null {
  // Match: https://docs.google.com/document/d/{docId}/...
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
