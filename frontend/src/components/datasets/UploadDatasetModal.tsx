import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/States";
import { formatBytes } from "@/lib/utils";
import { ApiError } from "@/api/client";
import type { CreateDatasetInput } from "@/api/datasets";

export interface UploadDatasetModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateDatasetInput) => void;
  isSubmitting: boolean;
  error: unknown;
}

export function UploadDatasetModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: UploadDatasetModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setFile(null);
    }
  }, [open]);

  const validName = name.trim().length > 0 && name.trim().length <= 255;
  const validFile = !!file;
  const canSubmit = validName && validFile && !isSubmitting;

  const submit = () => {
    if (!file || !validName) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      file,
    });
  };

  const apiError = error instanceof ApiError ? error : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload a dataset"
      description="Create a new dataset and its first immutable version. CSV or Parquet files only."
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Cancel
          </button>
          <button
            onClick={submit}
            className="btn-primary"
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            <span>{isSubmitting ? "Uploading…" : "Upload"}</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label-eyebrow mb-1.5 block">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="customers.csv"
            maxLength={255}
          />
          {!validName && name.length > 0 && (
            <p className="mt-1 text-xs text-sev-critical">
              Name must be 1–255 characters.
            </p>
          )}
        </div>

        <div>
          <label className="label-eyebrow mb-1.5 block">Description (optional)</label>
          <textarea
            className="input min-h-[80px] py-2.5"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this dataset contains, where it comes from, who owns it."
            maxLength={2000}
          />
        </div>

        <div>
          <label className="label-eyebrow mb-1.5 block">File</label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-ink-50/40 px-4 py-8 text-center transition-colors " +
              (drag
                ? "border-brand-400 bg-brand-50"
                : "border-ink-200 hover:border-brand-300 hover:bg-ink-50")
            }
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.parquet,text/csv,application/octet-stream"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <FileUp className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-ink-900">{file.name}</div>
                  <div className="text-xs text-ink-500">{formatBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  className="btn-icon -mr-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <FileUp className="h-5 w-5" />
                </div>
                <div className="text-sm font-medium text-ink-900">
                  Drop a CSV or Parquet file here
                </div>
                <div className="text-xs text-ink-500">
                  or click to choose. The first version is created automatically.
                </div>
              </>
            )}
          </div>
        </div>

        {apiError && <ErrorState error={apiError} title="Upload failed" />}
      </div>
    </Modal>
  );
}
