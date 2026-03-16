'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { ParsedJD, SearchQuery } from '@recruitment/shared';

interface JDData {
  id: string;
  title: string;
  clientName: string | null;
  rawText: string;
  parsedData: ParsedJD | null;
  searchQueries: { queries: SearchQuery[]; tips: string[] } | null;
  status: string;
}

export default function JDDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [jd, setJd] = useState<JDData | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [generatingQueries, setGeneratingQueries] = useState(false);
  const [editingParsed, setEditingParsed] = useState(false);
  const [editedParsed, setEditedParsed] = useState<ParsedJD | null>(null);

  const fetchJD = useCallback(async () => {
    try {
      const res = await fetch(`/api/jds/${id}`);
      const data = await res.json();
      if (data.success) {
        setJd(data.data);
        setEditedParsed(data.data.parsedData);
      }
    } catch {
      toast.error('Failed to load JD');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchJD();
  }, [fetchJD]);

  async function handleParse() {
    setParsing(true);
    try {
      const res = await fetch(`/api/jds/${id}/parse`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('JD parsed successfully');
        fetchJD();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Failed to parse JD');
    } finally {
      setParsing(false);
    }
  }

  async function handleGenerateQueries() {
    setGeneratingQueries(true);
    try {
      const res = await fetch(`/api/jds/${id}/search-query`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Search queries generated');
        fetchJD();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Failed to generate queries');
    } finally {
      setGeneratingQueries(false);
    }
  }

  async function handleSaveParsed() {
    try {
      const res = await fetch(`/api/jds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: editedParsed }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Changes saved');
        setEditingParsed(false);
        fetchJD();
      }
    } catch {
      toast.error('Failed to save');
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  if (!jd) {
    return <div className="text-center py-12 text-muted-foreground">JD not found</div>;
  }

  const parsed = editingParsed ? editedParsed : jd.parsedData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{jd.title}</h1>
          {jd.clientName && <p className="text-muted-foreground">{jd.clientName}</p>}
        </div>
        <Badge
          variant={
            jd.status === 'ACTIVE'
              ? 'success'
              : jd.status === 'PARSED'
                ? 'warning'
                : 'secondary'
          }
        >
          {jd.status}
        </Badge>
      </div>

      {/* Raw JD Text */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Job Description</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-md max-h-64 overflow-y-auto">
            {jd.rawText}
          </pre>
        </CardContent>
      </Card>

      {/* Parse Action */}
      {!jd.parsedData && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              Parse this JD with AI to extract structured skills, experience, and location data.
            </p>
            <Button onClick={handleParse} disabled={parsing} size="lg">
              {parsing ? 'Parsing with AI...' : 'Parse with AI'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Parsed Data Display */}
      {parsed && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Parsed Data</CardTitle>
              <div className="flex gap-2">
                {editingParsed ? (
                  <>
                    <Button size="sm" onClick={handleSaveParsed}>
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingParsed(false);
                        setEditedParsed(jd.parsedData);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditingParsed(true)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleParse} disabled={parsing}>
                      {parsing ? 'Re-parsing...' : 'Re-parse'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Job Title */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Job Title</label>
              {editingParsed ? (
                <Input
                  value={editedParsed?.jobTitle || ''}
                  onChange={(e) =>
                    setEditedParsed((p) => (p ? { ...p, jobTitle: e.target.value } : p))
                  }
                />
              ) : (
                <p className="font-medium">{parsed.jobTitle}</p>
              )}
            </div>

            {/* Must-Have Skills */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Must-Have Skills</label>
              {editingParsed ? (
                <Input
                  value={editedParsed?.mustHaveSkills.join(', ') || ''}
                  onChange={(e) =>
                    setEditedParsed((p) =>
                      p
                        ? {
                            ...p,
                            mustHaveSkills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                          }
                        : p
                    )
                  }
                  placeholder="Comma-separated skills"
                />
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {parsed.mustHaveSkills.map((skill) => (
                    <Badge key={skill} variant="default">
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Nice-to-Have Skills */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nice-to-Have Skills</label>
              {editingParsed ? (
                <Input
                  value={editedParsed?.niceToHaveSkills.join(', ') || ''}
                  onChange={(e) =>
                    setEditedParsed((p) =>
                      p
                        ? {
                            ...p,
                            niceToHaveSkills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                          }
                        : p
                    )
                  }
                  placeholder="Comma-separated skills"
                />
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {parsed.niceToHaveSkills.map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Experience Range */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Experience Range</label>
              {editingParsed ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-20"
                    value={editedParsed?.experienceRange.min || 0}
                    onChange={(e) =>
                      setEditedParsed((p) =>
                        p
                          ? {
                              ...p,
                              experienceRange: {
                                ...p.experienceRange,
                                min: parseInt(e.target.value) || 0,
                              },
                            }
                          : p
                      )
                    }
                  />
                  <span>to</span>
                  <Input
                    type="number"
                    className="w-20"
                    value={editedParsed?.experienceRange.max || 0}
                    onChange={(e) =>
                      setEditedParsed((p) =>
                        p
                          ? {
                              ...p,
                              experienceRange: {
                                ...p.experienceRange,
                                max: parseInt(e.target.value) || 0,
                              },
                            }
                          : p
                      )
                    }
                  />
                  <span>years</span>
                </div>
              ) : (
                <p>
                  {parsed.experienceRange.min} - {parsed.experienceRange.max} years
                </p>
              )}
            </div>

            {/* Locations */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Locations</label>
              {editingParsed ? (
                <Input
                  value={editedParsed?.locations.join(', ') || ''}
                  onChange={(e) =>
                    setEditedParsed((p) =>
                      p
                        ? { ...p, locations: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }
                        : p
                    )
                  }
                />
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {parsed.locations.map((loc) => (
                    <Badge key={loc} variant="outline">
                      {loc}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Education */}
            {parsed.education.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Education</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {parsed.education.map((edu) => (
                    <Badge key={edu} variant="outline">
                      {edu}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Salary */}
            {parsed.salary && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Salary</label>
                <p>
                  {parsed.salary.currency || 'INR'} {parsed.salary.min?.toLocaleString()} -{' '}
                  {parsed.salary.max?.toLocaleString()}
                </p>
              </div>
            )}

            {/* Key Responsibilities */}
            {parsed.keyResponsibilities.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Key Responsibilities
                </label>
                <ul className="list-disc list-inside mt-1 text-sm space-y-1">
                  {parsed.keyResponsibilities.map((resp, i) => (
                    <li key={i}>{resp}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Query Generation */}
      {jd.parsedData && !jd.searchQueries && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              Generate optimized Naukri RESDEX boolean search queries from the parsed JD data.
            </p>
            <Button onClick={handleGenerateQueries} disabled={generatingQueries} size="lg">
              {generatingQueries ? 'Generating Queries...' : 'Generate Search Queries'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search Queries Display */}
      {jd.searchQueries && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Naukri Boolean Search Queries</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateQueries}
              disabled={generatingQueries}
            >
              {generatingQueries ? 'Regenerating...' : 'Regenerate'}
            </Button>
          </div>

          {jd.searchQueries.queries.map((q: SearchQuery) => (
            <Card key={q.variant}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{q.label}</CardTitle>
                    <CardDescription>{q.characterCount} characters</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => copyToClipboard(q.query)}>
                    Copy Query
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="bg-gray-50 p-3 rounded-md text-sm whitespace-pre-wrap font-mono">
                  {q.query}
                </pre>

                {q.suggestedFilters && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      Suggested RESDEX Filters:
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {q.suggestedFilters.experience && (
                        <Badge variant="outline">
                          Exp: {q.suggestedFilters.experience.min}-
                          {q.suggestedFilters.experience.max} yrs
                        </Badge>
                      )}
                      {q.suggestedFilters.location?.map((loc) => (
                        <Badge key={loc} variant="outline">
                          {loc}
                        </Badge>
                      ))}
                      {q.suggestedFilters.freshness && (
                        <Badge variant="outline">{q.suggestedFilters.freshness}</Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Tips */}
          {jd.searchQueries.tips && jd.searchQueries.tips.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Search Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  {jd.searchQueries.tips.map((tip: string, i: number) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
