"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { DeletionPreviewSchema, DeletionReceiptSchema, type DeletionPreview, type DeletionReceipt, type DeletionTarget } from "@/lib/content-management/contracts";
import "@/app/content-management.css";

async function deletionRequest<T>(url: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const value: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(value);
    throw new Error(parsed.success ? parsed.data.error.message : "This content could not be deleted. Check its saved status before trying again.");
  }
  return schema.parse(value);
}

export function useContentDeletion(kind: DeletionTarget["kind"], currentDraft?: string) {
  const router = useRouter(); const dialog = useRef<HTMLDialogElement>(null); const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null); const lock = useRef(false); const operation = useRef<string | null>(null);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [hidden, setHidden] = useState<string[]>([]); const [receipts, setReceipts] = useState<DeletionReceipt[]>([]);
  const label = useId(); const description = useId(); const listFocus = useRef<HTMLDivElement>(null);
  const noun = kind === "run" ? "Reading" : "Story";
  useEffect(() => {
    let stopped = false;
    void deletionRequest(`/api/content/deletions?kind=${kind}`, z.object({ receipts: z.array(DeletionReceiptSchema) })).then(result => {
      if (!stopped) { setReceipts(result.receipts); setHidden(current => [...new Set([...current, ...result.receipts.map(item => item.id)])]); }
    }).catch(() => { if (!stopped) setError("Pending cleanup could not be checked. Your saved content has not been changed."); });
    return () => { stopped = true; };
  }, [kind]);
  useEffect(() => {
    if (preview && dialog.current && !dialog.current.open) { dialog.current.showModal(); cancel.current?.focus(); }
  }, [preview]);
  function close() {
    if (lock.current) return;
    dialog.current?.close(); setPreview(null); operation.current = null; setError(""); trigger.current?.focus();
  }
  async function requestDelete(id: string, element: HTMLElement) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage(""); trigger.current = element;
    try { setPreview(await deletionRequest(`/api/content/deletions/preview?kind=${kind}&id=${id}`, DeletionPreviewSchema)); }
    catch (error) { setError(error instanceof Error ? error.message : "The deletion scope could not be checked."); }
    finally { lock.current = false; setBusy(false); }
  }
  function accept(receipt: DeletionReceipt) {
    setHidden(current => [...new Set([...current, receipt.id])]);
    setReceipts(current => receipt.status === "complete" ? current.filter(item => item.operation_id !== receipt.operation_id) : [...current.filter(item => item.operation_id !== receipt.operation_id), receipt]);
    dialog.current?.close(); setPreview(null); operation.current = null;
    setMessage(receipt.status === "complete" ? `${noun} deleted permanently.` : "Deletion is recorded. Local file cleanup still needs to finish.");
    listFocus.current?.focus();
    if (kind === "creator" && currentDraft === receipt.id) router.replace("/studio");
    else router.refresh();
  }
  async function confirm() {
    if (!preview || lock.current || preview.active_work) return;
    lock.current = true; setBusy(true); setError(""); operation.current ??= crypto.randomUUID();
    try { accept(await deletionRequest("/api/content/deletions", DeletionReceiptSchema, { action: "begin", operation_id: operation.current, kind, id: preview.id, confirmation_revision: preview.confirmation_revision })); }
    catch (error) { setError(error instanceof Error ? error.message : "Deletion could not be confirmed. Nothing is reported as erased."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function recover(receipt: DeletionReceipt, resume: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { accept(await deletionRequest(resume ? "/api/content/deletions" : `/api/content/deletions/${receipt.operation_id}`, DeletionReceiptSchema, resume ? { action: "resume", operation_id: receipt.operation_id } : undefined)); }
    catch (error) { setError(error instanceof Error ? error.message : "Cleanup could not be checked. It has not been reported as complete."); }
    finally { lock.current = false; setBusy(false); }
  }
  return {
    hidden, busy, requestDelete,
    feedback: <div ref={listFocus} tabIndex={-1} className="management-feedback">
      {message && <p role="status">{message}</p>}{error && !preview && <p role="alert" className="management-error">{error}</p>}
      {receipts.map(receipt => <section key={receipt.operation_id} data-deletion-id={receipt.operation_id} className="management-pending" aria-label="Pending deletion cleanup">
        <h3>{receipt.status === "cleanup_failed" ? "Some local files still need cleanup" : "Deletion in progress"}</h3>
        <p>This {kind === "run" ? "reading" : "created story"} is no longer available. {receipt.remaining_files} local {receipt.remaining_files === 1 ? "file remains" : "files remain"}. Cleanup has not been reported as complete.</p>
        <div className="management-actions"><button type="button" disabled={busy} onClick={() => void recover(receipt, false)}>Check cleanup status</button><button type="button" disabled={busy} onClick={() => void recover(receipt, true)}>Retry cleanup</button></div>
      </section>)}
    </div>,
    confirmation: <dialog ref={dialog} className="deletion-dialog" aria-labelledby={label} aria-describedby={description} onCancel={event => { event.preventDefault(); close(); }}>
      <p className="book-eyebrow">PERMANENT LOCAL DELETION</p><h2 id={label}>{kind === "run" ? "Delete this reading?" : "Delete this story?"}</h2>
      <p className="deletion-title">{preview?.title}</p>
      <p id={description}>{kind === "run" ? "This will permanently remove this reading session, its generated chapters, saved choices, and illustrations. The original story will remain available." : "This will permanently remove this created story, its saved versions, opening illustrations, and associated local content."}</p>
      {kind === "creator" && preview && <p className="deletion-cascade">This also deletes <strong>{preview.run_count} saved {preview.run_count === 1 ? "reading" : "readings"}</strong> and {preview.version_count} saved {preview.version_count === 1 ? "version" : "versions"}. Other stories remain available.</p>}
      {preview?.active_work && <p role="status" className="management-error">An illustration or story request is still running. Wait for it to finish, then close this dialog and check again.</p>}
      {error && preview && <p role="alert" className="management-error">{error} Close this dialog to check the current scope before confirming again.</p>}
      <div className="deletion-dialog-actions"><button type="button" ref={cancel} className="book-secondary" disabled={busy} onClick={close}>Cancel</button><button type="button" className="management-danger" disabled={busy || preview?.active_work || Boolean(error)} onClick={() => void confirm()}>{busy ? "Deleting…" : "Delete permanently"}</button></div>
    </dialog>,
  };
}
