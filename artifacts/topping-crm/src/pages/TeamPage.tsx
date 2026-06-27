import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useListUsers, useCreateUser, useUpdateUser } from "@workspace/api-client-react";
import { getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Shield, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLES = ["CEO","Admin","Marketing_Manager","Sales_Rep","Closer","IT_Manager","Employee"];
const MANAGER_ROLES = ["CEO","Admin","Marketing_Manager"];
const roleColors: Record<string,string> = {
  CEO: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Marketing_Manager: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Sales_Rep: "bg-green-500/10 text-green-400 border-green-500/20",
  Closer: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  IT_Manager: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Employee: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const emptyForm = { email: "", name: "", role: "Employee", password: "", slug: "" };

export default function TeamPage() {
  const { user: currentUser } = useAuth();
  const isManager = MANAGER_ROLES.includes(currentUser?.role || "");

  const { data: users, isLoading } = useListUsers();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "Employee", slug: "", isActive: true });

  const createUser = useCreateUser({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); setOpen(false); setForm(emptyForm); } } });
  const updateUser = useUpdateUser({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); setEditOpen(false); setEditId(null); } } });

  const filtered = users?.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) || [];

  const openEdit = (u: typeof filtered[number]) => {
    if (!isManager) return;
    setEditId(u.id);
    setEditForm({ name: u.name, role: u.role, slug: u.slug || "", isActive: u.isActive ?? true });
    setEditOpen(true);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Team</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {users?.length || 0} members{isManager ? " · click a member to edit role" : ""}
            </p>
          </div>
          {isManager && (
            <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" />Add Member
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Search team..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-10 text-sm">No team members found</div>
            )}
            {filtered.map(user => {
              const userIsManager = MANAGER_ROLES.includes(user.role);
              return (
                <Card
                  key={user.id}
                  className={cn(
                    "border border-card-border transition-colors",
                    isManager ? "hover:border-primary/40 cursor-pointer" : "hover:border-primary/30"
                  )}
                  onClick={() => openEdit(user)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      userIsManager ? "bg-amber-500/10" : "bg-primary/10"
                    )}>
                      {userIsManager
                        ? <Shield className="w-4 h-4 text-amber-400" />
                        : <span className="font-bold text-primary">{user.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                        {user.name}
                        {userIsManager && <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wide">Manager</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      <Badge variant="outline" className={cn("mt-1.5 text-xs border", roleColors[user.role] || roleColors.Employee)}>
                        {user.role.replace("_"," ")}
                      </Badge>
                    </div>
                    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", user.isActive ? "bg-green-400" : "bg-zinc-500")} title={user.isActive ? "Active" : "Inactive"} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add member dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Full Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Password *</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r.replace("_"," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Slug (for booking)</Label><Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="e.g. shayan" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createUser.mutate({ data: { name: form.name, email: form.email, password: form.password, role: form.role, slug: form.slug || undefined } })} disabled={!form.name || !form.email || !form.password || createUser.isPending}>
              {createUser.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit member dialog */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserIcon className="w-4 h-4" />Edit Team Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r}>
                      <span className="flex items-center gap-2">
                        {MANAGER_ROLES.includes(r) && <Shield className="w-3 h-3 text-amber-400" />}
                        {r.replace("_"," ")}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {MANAGER_ROLES.includes(editForm.role)
                  ? "Manager — sees all leads (read-only) and all team reports"
                  : "Team member — sees only their own leads and reports"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Slug (for booking)</Label>
              <Input value={editForm.slug} onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))} placeholder="e.g. shayan" />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive members cannot sign in</p>
              </div>
              <Switch checked={editForm.isActive} onCheckedChange={v => setEditForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editId && updateUser.mutate({ id: editId, data: { name: editForm.name, role: editForm.role, slug: editForm.slug || undefined, isActive: editForm.isActive } })}
              disabled={!editForm.name || updateUser.isPending}
            >
              {updateUser.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
