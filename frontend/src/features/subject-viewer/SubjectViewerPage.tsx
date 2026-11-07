/**
 * @file SubjectViewerPage.tsx
 * @description Subject Editor & Document Viewer feature for course curriculum notes.
 * @owner Subject Viewer Team
 */

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useBlocker } from "react-router-dom";
import { toast } from "sonner";
import { DocumentViewer } from "./components/DocumentViewer";
import { ResourceTree } from "./components/ResourceTree";
import { ViewerTabs } from "./components/ViewerTabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { subjectViewerService, type SubjectNote } from "./services";

interface DraftNote {
  title: string;
  content: string;
  isDirty: boolean;
}

interface CachedDocUrl {
  url: string;
  fetchedAt: number;
}

export default function SubjectViewerPage() {
  const { subjectId = "dbms" } = useParams();
  const [notes, setNotes] = useState<SubjectNote[]>([]);
  const [tabs, setTabs] = useState<SubjectNote[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftNote>>({});
  const [docUrls, setDocUrls] = useState<Record<string, CachedDocUrl>>({});
  const [loadingDocUrl, setLoadingDocUrl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const active = useMemo(
    () => tabs.find((note) => note.id === activeId) ?? null,
    [tabs, activeId]
  );

  // Synchronously derived content and title for active note (eliminates mount lag)
  const currentTitle = drafts[active?.id ?? ""]?.title ?? active?.title ?? "";
  const currentContent = drafts[active?.id ?? ""]?.content ?? active?.content ?? "";
  const isDirty = drafts[active?.id ?? ""]?.isDirty ?? false;

  // Track if any draft has unsaved changes
  const hasDirtyDrafts = useMemo(
    () => Object.values(drafts).some((d) => d.isDirty),
    [drafts]
  );

  // In-app navigation blocker: intercepts clicking links, switching subjects, or routes
  const blocker = useBlocker(hasDirtyDrafts);

  // Browser window / tab close warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirtyDrafts) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDirtyDrafts]);

  // Load notes tree whenever the active subjectId changes
  useEffect(() => {
    let isMounted = true;

    subjectViewerService.getNotesTree(subjectId).then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      const loaded = data ?? [];
      setNotes(loaded);

      // Cleanly maintain or seed tabs without side effects inside updaters
      setTabs((currentTabs) => {
        const validTabs = currentTabs.filter((t) => t.subjectId === subjectId);
        if (validTabs.length > 0) return validTabs;
        return loaded.length > 0 ? [loaded[0]] : [];
      });

      setActiveId((currentActiveId) => {
        const stillValid = loaded.some((n) => n.id === currentActiveId);
        if (stillValid) return currentActiveId;
        return loaded.length > 0 ? loaded[0].id : null;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [subjectId]);

  // Lazy on-demand signed URL retrieval for PDFs
  useEffect(() => {
    if (!active || active.tag === "Private" || !active.storagePath) return;

    const cached = docUrls[active.id];
    const now = Date.now();
    // Reuse cached URL if fetched less than 50 minutes ago (1-hour TTL)
    if (cached && now - cached.fetchedAt < 50 * 60 * 1000) {
      return;
    }

    let isMounted = true;
    setLoadingDocUrl(true);

    subjectViewerService.getDocumentUrl(active.storagePath).then(({ data, error }) => {
      if (!isMounted) return;
      setLoadingDocUrl(false);
      if (error || !data) {
        toast.error(error?.message ?? "Could not load document preview.");
        return;
      }
      setDocUrls((prev) => ({
        ...prev,
        [active.id]: { url: data, fetchedAt: Date.now() },
      }));
    });

    return () => {
      isMounted = false;
    };
  }, [active?.id, active?.storagePath, active?.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleChange = (newTitle: string) => {
    if (!active) return;
    setDrafts((prev) => ({
      ...prev,
      [active.id]: {
        title: newTitle,
        content: prev[active.id]?.content ?? active.content ?? "",
        isDirty: true,
      },
    }));
  };

  const handleContentChange = (newContent: string) => {
    if (!active) return;
    setDrafts((prev) => ({
      ...prev,
      [active.id]: {
        title: prev[active.id]?.title ?? active.title,
        content: newContent,
        isDirty: true,
      },
    }));
  };

  const open = (note: SubjectNote) => {
    setTabs((current) =>
      current.some((item) => item.id === note.id) ? current : [...current, note]
    );
    setActiveId(note.id);
  };

  const close = (id: string) => {
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (id === activeId) {
      setActiveId(remaining.at(-1)?.id ?? null);
    }
    // Clean up draft for closed tab
    setDrafts((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const create = async () => {
    const result = await subjectViewerService.createTextNote({
      subjectId,
      title: "Untitled note",
      content: "",
    });
    if (result.error || !result.data) {
      return toast.error(result.error?.message ?? "Could not create note.");
    }
    const newNote = result.data;
    setNotes((current) => [...current, newNote]);
    open(newNote);
    toast.success("New personal note created.");
  };

  const save = async () => {
    if (!active || active.tag !== "Private") return;
    setSaving(true);
    const saveTitle = currentTitle.trim() || "Untitled note";
    const saveContent = currentContent;
    const result = await subjectViewerService.updateTextNote(active.id, saveTitle, saveContent);
    setSaving(false);

    if (result.error || !result.data) {
      return toast.error(result.error?.message ?? "Could not save note.");
    }

    const updated = result.data;
    setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)));
    setTabs((current) => current.map((n) => (n.id === updated.id ? updated : n)));

    // Clear isDirty only if the draft was not further modified while the save was in flight
    setDrafts((prev) => {
      const currentDraft = prev[updated.id];
      if (!currentDraft) return prev;
      const stillSame = currentDraft.title === saveTitle && currentDraft.content === saveContent;
      return {
        ...prev,
        [updated.id]: {
          ...currentDraft,
          isDirty: !stillSame,
        },
      };
    });

    toast.success("Note saved successfully.");
  };

  const remove = () => {
    if (!active || active.tag !== "Private") return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!active || active.tag !== "Private") return;

    try {
      setIsDeleting(true);
      const result = await subjectViewerService.deleteTextNote(active.id);
      if (result.error) {
        toast.error(result.error.message);
        return;
      }

      const noteId = active.id;
      setNotes((current) => current.filter((n) => n.id !== noteId));
      close(noteId);
      setDrafts((prev) => {
        const { [noteId]: _, ...rest } = prev;
        return rest;
      });
      toast.success("Note deleted.");
      setShowDeleteConfirm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete note.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <ResourceTree
        notes={notes}
        activeId={activeId}
        onOpen={open}
        onCreate={create}
      />
      <section className="flex min-w-0 flex-1 flex-col h-full overflow-hidden bg-background">
        <ViewerTabs
          tabs={tabs}
          activeId={activeId}
          onSelect={open}
          onClose={close}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <DocumentViewer
            note={active}
            title={currentTitle}
            content={currentContent}
            saving={saving}
            isDirty={isDirty}
            contentUrl={active ? docUrls[active.id]?.url : null}
            isLoadingUrl={loadingDocUrl}
            onTitle={handleTitleChange}
            onContent={handleContentChange}
            onSave={save}
            onDelete={active?.tag === "Private" ? remove : undefined}
          />
        </div>
      </section>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Private Note"
        description={
          active ? (
            <>
              Are you sure you want to delete <span className="font-semibold text-foreground">&ldquo;{active.title}&rdquo;</span>? This cannot be undone.
            </>
          ) : undefined
        }
        confirmText="Delete Note"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
      />

      {/* In-app navigation blocker confirmation */}
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(openState) => {
          if (!openState && blocker.state === "blocked") {
            blocker.reset?.();
          }
        }}
        title="Unsaved Changes"
        description="You have unsaved changes in your notes. Leaving this page will discard your recent edits."
        confirmText="Discard and Leave"
        cancelText="Keep Editing"
        variant="destructive"
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
