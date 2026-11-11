import React from "react";
import { FileText, X, PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SubjectNote } from "../services";

interface Props {
  tabs: SubjectNote[];
  activeId: string | null;
  onSelect: (note: SubjectNote) => void;
  onClose: (id: string) => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function ViewerTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  isSidebarOpen = true,
  onToggleSidebar,
}: Props) {
  if (tabs.length === 0) {
    return (
      <div className="flex h-9 shrink-0 items-center border-b bg-muted/20 text-xs text-muted-foreground select-none">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="h-9 w-9 shrink-0 rounded-none border-r text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
            title={isSidebarOpen ? "Collapse Course Resources" : "Expand Course Resources"}
            aria-label={isSidebarOpen ? "Collapse Course Resources" : "Expand Course Resources"}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
        )}
        <span className="px-4">No documents currently open</span>
      </div>
    );
  }

  return (
    <div className="flex h-9 shrink-0 overflow-x-auto border-b bg-muted/25 select-none no-scrollbar">
      {onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-9 w-9 shrink-0 rounded-none border-r text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
          title={isSidebarOpen ? "Collapse Course Resources" : "Expand Course Resources"}
          aria-label={isSidebarOpen ? "Collapse Course Resources" : "Expand Course Resources"}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </Button>
      )}
      {tabs.map((note) => {
        const isActive = note.id === activeId;
        return (
          <div
            key={note.id}
            className={`group flex min-w-36 max-w-64 items-center gap-2 border-r px-3 text-xs transition-colors ${
              isActive
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(note)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left truncate cursor-pointer py-1.5"
            >
              <FileText
                className={`h-3.5 w-3.5 shrink-0 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <span className="truncate">{note.title}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(note.id);
              }}
              aria-label={`Close ${note.title}`}
              className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100 transition-opacity cursor-pointer shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
