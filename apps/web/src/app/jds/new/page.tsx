'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

export default function NewJDPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [inputMode, setInputMode] = useState<'paste' | 'gdocs'>('paste');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const clientName = formData.get('clientName') as string;
    const rawText = formData.get('rawText') as string;
    const googleDocsUrl = formData.get('googleDocsUrl') as string;

    try {
      const res = await fetch('/api/jds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, clientName, rawText, googleDocsUrl }),
      });

      const data = await res.json();
      if (!data.success) {
        toast.error(data.error);
        return;
      }

      toast.success('JD created successfully');
      router.push(`/jds/${data.data.id}`);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>New Job Description</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">
                Job Title *
              </label>
              <Input id="title" name="title" required placeholder="e.g., Senior React Developer" />
            </div>

            <div>
              <label htmlFor="clientName" className="block text-sm font-medium mb-1">
                Client Name
              </label>
              <Input id="clientName" name="clientName" placeholder="e.g., Acme Corp" />
            </div>

            {/* Input mode toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={inputMode === 'paste' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setInputMode('paste')}
              >
                Paste JD Text
              </Button>
              <Button
                type="button"
                variant={inputMode === 'gdocs' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setInputMode('gdocs')}
              >
                Google Docs URL
              </Button>
            </div>

            {inputMode === 'paste' ? (
              <div>
                <label htmlFor="rawText" className="block text-sm font-medium mb-1">
                  JD Text *
                </label>
                <Textarea
                  id="rawText"
                  name="rawText"
                  rows={12}
                  placeholder="Paste the full job description here..."
                />
              </div>
            ) : (
              <div>
                <label htmlFor="googleDocsUrl" className="block text-sm font-medium mb-1">
                  Google Docs URL *
                </label>
                <Input
                  id="googleDocsUrl"
                  name="googleDocsUrl"
                  type="url"
                  placeholder="https://docs.google.com/document/d/..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The document must be shared as &quot;Anyone with the link can view&quot;
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create JD'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
