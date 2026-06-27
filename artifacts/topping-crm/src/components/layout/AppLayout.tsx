import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, GitMerge, Users,
  Calendar, ListChecks, BarChart2, Settings,
  LogOut, Menu, X, TrendingUp, ChevronRight, DollarSign, BookOpen, Sparkles, ShieldCheck, KeyRound, Zap, Briefcase, Calculator
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import NotificationBell from "@/components/layout/NotificationBell";

type Role = "CEO" | "Admin" | "Marketing_Manager" | "Sales_Rep" | "Closer" | "IT_Manager" | "Employee";

// Who is allowed to manage the deployment/staff side of the system.
const ADMIN_ROLES: Role[] = ["CEO", "Admin"];
// Admins plus department leads who assign and track team work.
const MANAGER_ROLES: Role[] = ["CEO", "Admin", "Marketing_Manager"];

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: Role[]; // undefined = visible to everyone
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

// Grouped so the sidebar reads as sections instead of one long flat list.
// `roles` hides items the role can't act on (the server enforces the real rules).
const navGroups: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ADMIN_ROLES },
      { label: "My Work", href: "/my-work", icon: Briefcase },
      { label: "Commission Calc", href: "/commission", icon: Calculator },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Pipeline", href: "/pipeline", icon: GitMerge },
      { label: "Leads", href: "/leads", icon: TrendingUp },
    ],
  },
  {
    title: "Schedule",
    items: [
      { label: "Calendar", href: "/calendar", icon: Calendar },
      { label: "Tasks", href: "/tasks", icon: ListChecks, roles: MANAGER_ROLES },
    ],
  },
  {
    title: "Performance",
    items: [
      { label: "KPI", href: "/kpi", icon: BarChart2, roles: ADMIN_ROLES },
      { label: "Automations", href: "/automations", icon: Zap, roles: ADMIN_ROLES },
      { label: "AI Assistant", href: "/assistant", icon: Sparkles },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Payroll & Comp", href: "/payroll", icon: DollarSign, roles: ADMIN_ROLES },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Approvals", href: "/approvals", icon: ShieldCheck, roles: ADMIN_ROLES },
      { label: "Bookings", href: "/bookings", icon: BookOpen, roles: ADMIN_ROLES },
      { label: "Team", href: "/team", icon: Users },
      { label: "Permissions", href: "/permissions", icon: KeyRound, roles: ADMIN_ROLES },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const roleBadgeColor: Record<string, string> = {
  CEO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Marketing_Manager: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Sales_Rep: "bg-green-500/20 text-green-400 border-green-500/30",
  Closer: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  IT_Manager: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Employee: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = (user?.role || "Employee") as Role;
  const visibleGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !item.roles || item.roles.includes(role)),
    }))
    .filter(group => group.items.length > 0);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-sm">T</span>
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm text-sidebar-foreground leading-none">Topping</div>
          <div className="text-xs text-sidebar-foreground/50 leading-none mt-0.5">Courier CRM</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {visibleGroups.map((group, gi) => (
          <div key={group.title ?? `group-${gi}`} className={cn(gi > 0 && "mt-4")}>
            {group.title && (
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {group.title}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = location === href || location.startsWith(href + "/");
                return (
                  <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer group",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{label}</span>
                      {active && <ChevronRight className="w-3 h-3 opacity-60" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User */}
      <div className="p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-primary text-sm font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</div>
            <div className={cn(
              "text-xs px-1.5 py-0.5 rounded border inline-block mt-0.5",
              roleBadgeColor[user?.role || "Employee"] || roleBadgeColor.Employee
            )}>
              {user?.role?.replace("_", " ")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
            onClick={logout}
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-56 h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar — mobile menu + global notification bell */}
        <header className="flex items-center justify-between gap-3 h-12 px-4 border-b border-border bg-background flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm md:hidden">Topping CRM</span>
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
