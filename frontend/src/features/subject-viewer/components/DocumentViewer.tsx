import React, { useEffect } from "react";
import { FileText, Save, Trash2, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { SubjectNote } from "../services";
import { MilkdownEditor } from "./MilkdownEditor";

interface Props {
  note: SubjectNote | null;
  title: string;
  content: string;
  saving: boolean;
  isDirty?: boolean;
  contentUrl?: string | null;
  isLoadingUrl?: boolean;
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onSave: () => void;
  onDelete?: () => void;
}

export function DocumentViewer({
  note,
  title,
  content,
  saving,
  isDirty = false,
  contentUrl,
  isLoadingUrl = false,
  onTitle,
  onContent,
  onSave,
  onDelete,
}: Props) {
  // Listen for Ctrl+S / Cmd+S shortcut to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (note?.tag === "Private" && !saving) {
          onSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [note?.tag, saving, onSave]);

  if (!note) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground select-none">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
          <FileText className="h-8 w-8" />
        </div>
        <div>
          <p className="font-semibold text-foreground text-base">Select a resource</p>
          <p className="text-sm text-muted-foreground max-w-xs mt-1">
            Choose a curated PDF or personal note from the resources sidebar to start reading or editing.
          </p>
        </div>
      </div>
    );
  }

  // Admin-approved community resource
  if (note.tag !== "Private") {
    const activeUrl = contentUrl ?? note.contentUrl;

    return (
      <div className="flex h-full flex-col bg-muted/15">
        {isLoadingUrl ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs">Preparing document viewer…</span>
          </div>
        ) : activeUrl ? (
          <iframe
            className="min-h-0 flex-1 w-full bg-white border-0"
            src={activeUrl}
            title={note.title}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <p className="font-semibold text-foreground text-base">{note.title}</p>
              <p className="text-sm text-muted-foreground">
                This verified academic document is cataloged under the{" "}
                <span className="font-medium text-foreground">{note.tag}</span> curriculum category.
              </p>
              <div className="pt-2 flex justify-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Read-Only Archive
                </Badge>
                <Badge variant="outline" className="text-xs">
                  PDF Format
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Personal editable Markdown note
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b bg-background px-4 py-2.5">
        <div className="relative flex-1 max-w-sm">
          <Input
            value={title}
            onChange={(event) => onTitle(event.target.value)}
            aria-label="Note title"
            placeholder="Untitled note..."
            className="h-8 text-sm font-medium"
          />
          {isDirty && (
            <span
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-amber-500"
              title="Unsaved changes"
            />
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Private Note</span>
          {isDirty && (
            <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
              Unsaved
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {onDelete && (
            <Button
              onClick={onDelete}
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="Delete note"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          )}

          <Button
            onClick={onSave}
            disabled={saving || !isDirty}
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
            title="Save note (Ctrl+S)"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving…" : "Save"}</span>
          </Button>
        </div>
      </div>

      <MilkdownEditor key={note.id} initialValue={content} onChange={onContent} />
    </div>
  );
}
