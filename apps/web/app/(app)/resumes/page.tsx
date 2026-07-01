'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { resumesApi, type Resume } from '@/lib/api';
import { Eye, History, RefreshCw, Star, Trash2, Upload } from 'lucide-react';

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function ResumeListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDefault, setIsDefault] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Resume[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const items = await resumesApi.list();
      setResumes(items);
      setError(null);
      if (items.length > 0 && !selectedId) {
        setSelectedId(items[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resumes');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadHistory = useCallback(async (resumeId: string) => {
    setHistoryLoading(true);
    try {
      const versions = await resumesApi.versionHistory(resumeId);
      setHistory(versions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const handleUpload = () => {
    if (!file) return;
    startTransition(async () => {
      try {
        const created = await resumesApi.upload(
          file,
          name || file.name.replace(/\.pdf$/i, ''),
          isDefault,
        );
        setFile(null);
        setName('');
        setIsDefault(false);
        setSelectedId(created.id);
        setPreviewId(created.id);
        await load();
        flash('Resume uploaded');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      }
    });
  };

  const handleReplace = (id: string, replaceFile: File) => {
    startTransition(async () => {
      try {
        const updated = await resumesApi.replace(id, replaceFile);
        setSelectedId(updated.id);
        setPreviewId(updated.id);
        await load();
        flash(`Replaced — now v${updated.version}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Replace failed');
      }
    });
  };

  const handleSetDefault = (id: string) => {
    setResumes((prev) => prev.map((r) => ({ ...r, isDefault: r.id === id })));
    startTransition(async () => {
      try {
        await resumesApi.setDefault(id);
        await load();
        flash('Default resume updated');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to set default');
        await load();
      }
    });
  };

  const handleDelete = (id: string) => {
    const prev = resumes;
    setResumes((r) => r.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (previewId === id) setPreviewId(null);

    startTransition(async () => {
      try {
        const result = await resumesApi.delete(id);
        if (result.archived) {
          flash('Resume archived (referenced by past emails)');
        } else {
          flash('Resume deleted');
        }
        await load();
      } catch (e) {
        setResumes(prev);
        setError(e instanceof Error ? e.message : 'Delete failed');
      }
    });
  };

  const selectedResume = resumes.find((r) => r.id === selectedId) ?? null;
  const previewResumeId = previewId ?? selectedId;

  return (
    <>
      <PageHeader
        title="Resumes"
        description="Upload PDF resumes, manage versions, and set a default for email builds."
      />

      {message && (
        <div className="mx-8 mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </div>
      )}

      <div className="grid gap-6 p-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload Resume</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="resume-name">Display name</Label>
                <Input
                  id="resume-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Frontend Resume"
                />
              </div>
              <div>
                <Label htmlFor="resume-file">PDF file</Label>
                <Input
                  id="resume-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                Set as default resume
              </label>
              <Button onClick={handleUpload} disabled={!file || isPending}>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </CardContent>
          </Card>

          {loading ? (
            <ResumeListSkeleton />
          ) : (
            <div className="space-y-3">
              {resumes.map((resume) => (
                <Card
                  key={resume.id}
                  className={selectedId === resume.id ? 'ring-2 ring-primary' : undefined}
                >
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setSelectedId(resume.id);
                        setPreviewId(resume.id);
                      }}
                    >
                      <p className="font-medium">
                        {resume.name}{' '}
                        <span className="text-muted-foreground">(v{resume.version})</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {resume.fileName} · {formatSize(resume.fileSize)}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Preview"
                        onClick={() => setPreviewId(resume.id)}
                        disabled={isPending}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Replace with new version"
                        onClick={() => {
                          setReplaceTargetId(resume.id);
                          replaceInputRef.current?.click();
                        }}
                        disabled={isPending}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      {resume.isDefault ? (
                        <Badge variant="success">Default</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          title="Set as default"
                          onClick={() => handleSetDefault(resume.id)}
                          disabled={isPending}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete or archive"
                        onClick={() => handleDelete(resume.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {resumes.length === 0 && (
                <p className="text-sm text-muted-foreground">No resumes uploaded yet.</p>
              )}
            </div>
          )}

          <input
            ref={replaceInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && replaceTargetId) handleReplace(replaceTargetId, f);
              e.target.value = '';
              setReplaceTargetId(null);
            }}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewResumeId ? (
                <iframe
                  title="Resume preview"
                  src={resumesApi.previewUrl(previewResumeId)}
                  className="h-[480px] w-full rounded-md border bg-muted/30"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a resume to preview the PDF.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5" />
                Version History
                {selectedResume && (
                  <span className="text-sm font-normal text-muted-foreground">
                    — {selectedResume.name}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No version history yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">v{v.version}</span>
                        <span className="ml-2 text-muted-foreground">{v.fileName}</span>
                        {v.archived && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Archived
                          </Badge>
                        )}
                        {v.isDefault && (
                          <Badge variant="success" className="ml-2 text-[10px]">
                            Default
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewId(v.id)}
                        disabled={isPending}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
