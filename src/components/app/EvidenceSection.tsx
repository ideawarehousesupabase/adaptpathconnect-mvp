import { useRef, useState, type ChangeEvent } from "react";
import { Camera, ExternalLink, FileText, Loader2, Ruler, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState, Section } from "@/components/app/ui-bits";
import { CaseError } from "@/lib/cases";
import { formatDateTime } from "@/lib/domain";
import { describeError } from "@/lib/firebase";
import { ACCEPTED_TYPES, removeEvidence, uploadEvidence, useCaseUploads, type EvidenceCategory, type Upload } from "@/lib/uploads";
import { useCurrentUser } from "@/lib/workspace";

const TILES = [
  [Camera, "Bathroom Photos"],
  [Ruler, "Measurement Photos"],
  [FileText, "Supporting Documents"],
] as const;

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Photos and documents for a case, saved to Cloud Storage as soon as they are chosen. */
export function EvidenceSection({ caseId }: { caseId: string }) {
  const session = useCurrentUser();
  const { uploads, error } = useCaseUploads(session.userId, caseId);
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<EvidenceCategory | null>(null);
  const [uploading, setUploading] = useState<EvidenceCategory | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  function choose(category: EvidenceCategory) {
    setTarget(category);
    input.current?.click();
  }

  async function picked(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!target || files.length === 0) return;
    setUploading(target);
    let done = 0;
    for (const file of files) {
      try {
        await uploadEvidence(session, caseId, target, file);
        done++;
      } catch (err) {
        console.error(err);
        toast.error(err instanceof CaseError ? err.message : describeError(err, `Could not upload ${file.name}. Try again.`));
      }
    }
    if (done) toast.success(`${done} file${done === 1 ? "" : "s"} attached to ${target}.`);
    setUploading(null);
  }

  async function remove(u: Upload) {
    setRemoving(u.id);
    try {
      await removeEvidence(session, u);
      toast.success(`${u.fileName} removed.`);
    } catch (err) {
      console.error(err);
      toast.error(describeError(err, `Could not remove ${u.fileName}. Try again.`));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Section title="Supporting Evidence" description="Photos (JPG, PNG, WebP, HEIC) or PDF documents up to 10 MB. Files are saved to the case as soon as they upload.">
      <input ref={input} type="file" multiple accept={ACCEPTED_TYPES} className="hidden" onChange={picked} />
      {error ? <ErrorState message={error} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {TILES.map(([I, l]) => {
              const n = uploads?.filter((u) => u.category === l).length ?? 0;
              return (
                <button type="button" key={l} disabled={uploads === null || uploading !== null} onClick={() => choose(l)} className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input p-6 text-center hover:bg-muted disabled:opacity-60">
                  {uploading === l ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <I className="h-6 w-6 text-primary" />}
                  <span className="text-sm font-semibold">{l}</span>
                  <span className="text-xs text-muted-foreground">
                    {uploading === l ? "Uploading…" : uploads === null ? "Loading…" : n === 0 ? "None attached" : `${n} attached`}
                  </span>
                </button>
              );
            })}
          </div>
          {uploads && uploads.length > 0 && (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {uploads.map((u) => {
                const t = formatDateTime(u.uploadedAt);
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.fileName}</p>
                      <p className="text-xs text-muted-foreground">{u.category} · {size(u.size)} · {t.date} {t.time} · {u.uploadedBy}</p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={u.downloadURL} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open</a>
                    </Button>
                    <Button variant="outline" size="sm" disabled={removing === u.id} onClick={() => remove(u)} aria-label={`Remove ${u.fileName}`}>
                      {removing === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
