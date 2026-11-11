import type { Subject } from "@/shared/user";

export const subjects: Subject[] = [
  { id: "dbms", name: "Database Management Systems", code: "CS301" },
  { id: "cn", name: "Computer Networks", code: "CS302" },
  { id: "os", name: "Operating Systems", code: "CS303" },
  { id: "dsa", name: "Data Structures & Algorithms", code: "CS201" },
  { id: "bee", name: "Basic Electrical Engineering", code: "EE101" },
  { id: "eg", name: "Engineering Graphics", code: "ME102" },
  { id: "daa", name: "Design and Analysis of Algorithms", code: "CS304" },
  { id: "dm", name: "Discrete Mathematics", code: "MA202" },
  { id: "epp", name: "Engineering Professional Practice", code: "HS301" },
];

export function getSubjectById(id?: string): Subject | undefined {
  if (!id) return undefined;
  const lowerId = id.toLowerCase();
  return (
    subjects.find((s) => s.id.toLowerCase() === lowerId || s.code.toLowerCase() === lowerId) ??
    // Legacy id support (e.g. cs301 -> dbms)
    (lowerId === "cs301" ? subjects.find((s) => s.id === "dbms") : undefined) ??
    (lowerId === "cs302" ? subjects.find((s) => s.id === "cn") : undefined) ??
    (lowerId === "cs303" ? subjects.find((s) => s.id === "os") : undefined) ??
    (lowerId === "cs304" ? subjects.find((s) => s.id === "daa") : undefined) ??
    (lowerId === "hs301" ? subjects.find((s) => s.id === "epp") : undefined)
  );
}
