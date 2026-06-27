import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Check, Minus, ShieldCheck } from "lucide-react";

const ROLES = [
  "CEO",
  "Admin",
  "Marketing_Manager",
  "Sales_Rep",
  "Closer",
  "IT_Manager",
  "Employee",
] as const;

type Role = (typeof ROLES)[number];

const roleBadgeColor: Record<string, string> = {
  CEO: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  Admin: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  Marketing_Manager: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  Sales_Rep: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
  Closer: "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30",
  IT_Manager: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  Employee: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};

// Cell: "full" = unrestricted, "none" = blocked, any other string = scoped label (e.g. "Own")
type Cell = "full" | "none" | string;

const F: Cell = "full";
const N: Cell = "none";
const all = (c: Cell): Cell[] => ROLES.map(() => c);

interface Action {
  action: string;
  note?: string;
  cells: Cell[]; // aligned to ROLES order
}

interface Group {
  title: string;
  actions: Action[];
}

const GROUPS: Group[] = [
  {
    title: "Deals & Pipeline",
    actions: [
      { action: "View deals & pipeline", note: "Non-admins see only deals they own", cells: [F, F, "Own", "Own", "Own", "Own", "Own"] },
      { action: "Create a deal", cells: all(F) },
      { action: "Edit a deal", note: "Locked for non-admins once submitted or approved", cells: [F, F, "Own", "Own", "Own", "Own", "Own"] },
      { action: "Submit a deal for review", cells: [F, F, "Own", "Own", "Own", "Own", "Own"] },
      { action: "Approve / reject a submission", cells: [F, F, N, N, N, N, N] },
      { action: "Set founder approval", cells: [F, F, N, N, N, N, N] },
      { action: "Apply clawback / set commission status", cells: [F, F, N, N, N, N, N] },
      { action: "Delete a deal", cells: [F, F, N, N, N, N, N] },
      { action: "View approval queues", cells: [F, F, N, N, N, N, N] },
    ],
  },
  {
    title: "Leads",
    actions: [
      { action: "View leads", note: "Managers see all; others see only their own", cells: [F, F, F, "Own", "Own", "Own", "Own"] },
      { action: "Create a lead", note: "Managers are observers — cannot create", cells: [N, N, N, F, F, F, F] },
      { action: "Edit a lead", note: "Managers are observers — cannot edit", cells: [N, N, N, "Own", "Own", "Own", "Own"] },
      { action: "Delete a lead", note: "Managers are observers — cannot delete", cells: [N, N, N, "Own", "Own", "Own", "Own"] },
    ],
  },
  {
    title: "Clients, Companies, Meetings & Tasks",
    actions: [
      { action: "Manage clients (full CRUD)", cells: all(F) },
      { action: "Manage companies (full CRUD)", cells: all(F) },
      { action: "Manage meetings & team calendar", cells: all(F) },
      { action: "Manage tasks (full CRUD)", cells: all(F) },
    ],
  },
  {
    title: "KPI & Reports",
    actions: [
      { action: "View KPI dashboard", note: "Managers see the team; others see themselves", cells: [F, F, F, "Self", "Self", "Self", "Self"] },
      { action: "View another user's KPI", cells: [F, F, F, "Self", "Self", "Self", "Self"] },
      { action: "Submit a daily KPI report", cells: all(F) },
      { action: "View KPI reports", note: "Managers see all; others see their own", cells: [F, F, F, "Own", "Own", "Own", "Own"] },
      { action: "Share a report on behalf of others", cells: [F, F, F, "Self", "Self", "Self", "Self"] },
    ],
  },
  {
    title: "Payroll & Compensation",
    actions: [
      { action: "View own payroll", cells: all(F) },
      { action: "View all payroll", cells: [F, F, N, N, N, N, N] },
      { action: "Calculate payroll", note: "Admins can target anyone; others only themselves", cells: [F, F, "Self", "Self", "Self", "Self", "Self"] },
      { action: "Approve / reject / mark paid", cells: [F, F, N, N, N, N, N] },
      { action: "Send payroll email to staff", cells: [F, F, N, N, N, N, N] },
    ],
  },
  {
    title: "Team & Accounts",
    actions: [
      { action: "View team directory", cells: all(F) },
      { action: "Add a team member", cells: [F, F, F, N, N, N, N] },
      { action: "Edit own profile", cells: all(F) },
      { action: "Change a user's role or active status", cells: [F, F, F, N, N, N, N] },
    ],
  },
  {
    title: "Bookings & Integrations",
    actions: [
      { action: "View / assign booking requests", cells: [F, F, N, N, N, N, N] },
      { action: "Use the AI Assistant", note: "Managers get team-wide data scope", cells: all(F) },
      { action: "Send Gmail / sync Calendar / export Sheets", cells: all(F) },
    ],
  },
];

function CellMark({ value }: { value: Cell }) {
  if (value === "full") {
    return (
      <span className="inline-flex items-center justify-center">
        <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
      </span>
    );
  }
  if (value === "none") {
    return (
      <span className="inline-flex items-center justify-center">
        <Minus className="w-3.5 h-3.5 text-muted-foreground/40" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 whitespace-nowrap">
      {value}
    </span>
  );
}

export default function PermissionsPage() {
  const { user } = useAuth();
  const currentRole = user?.role;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Permissions Matrix</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every role and the actions it can perform across the CRM. Reflects the access rules enforced by the server.
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 my-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-muted-foreground">Full access</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
              Own
            </span>
            <span className="text-muted-foreground">Limited to own / self records</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus className="w-3.5 h-3.5 text-muted-foreground/40" />
            <span className="text-muted-foreground">No access</span>
          </div>
        </div>

        {/* Matrix */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left font-semibold px-4 py-3 sticky left-0 bg-muted/50 z-10 min-w-[220px] border-b border-border">
                  Action
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    className={cn(
                      "px-2 py-3 text-center font-semibold border-b border-border whitespace-nowrap",
                      role === currentRole && "bg-primary/5"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block px-2 py-0.5 rounded border text-xs",
                        roleBadgeColor[role]
                      )}
                    >
                      {role.replace(/_/g, " ")}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => (
                <GroupRows key={group.title} group={group} currentRole={currentRole} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          <span className="font-medium text-foreground">Admin</span> = CEO &amp; Admin.{" "}
          <span className="font-medium text-foreground">Managers</span> = CEO, Admin &amp; Marketing Manager. All
          actions require a signed-in account; every list is automatically scoped to what each role is allowed to see.
        </p>
      </div>
    </AppLayout>
  );
}

function GroupRows({ group, currentRole }: { group: Group; currentRole?: string }) {
  return (
    <>
      <tr>
        <td
          colSpan={ROLES.length + 1}
          className="px-4 py-2 bg-muted/30 text-xs font-bold uppercase tracking-wide text-muted-foreground sticky left-0 border-b border-border"
        >
          {group.title}
        </td>
      </tr>
      {group.actions.map((a, i) => (
        <tr key={a.action} className={cn("border-b border-border", i % 2 === 1 && "bg-muted/10")}>
          <td className="px-4 py-2.5 sticky left-0 bg-background z-10 align-top">
            <div className="font-medium">{a.action}</div>
            {a.note && <div className="text-xs text-muted-foreground mt-0.5">{a.note}</div>}
          </td>
          {a.cells.map((cell, idx) => (
            <td
              key={ROLES[idx]}
              className={cn(
                "px-2 py-2.5 text-center align-middle",
                ROLES[idx] === currentRole && "bg-primary/5"
              )}
            >
              <CellMark value={cell} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
