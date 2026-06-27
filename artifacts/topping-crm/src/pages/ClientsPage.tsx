import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useListClients, useCreateClient, useUpdateClient, useDeleteClient } from "@workspace/api-client-react";
import { getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ActivityTimeline from "@/components/ActivityTimeline";

const statusColors: Record<string,string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  inactive: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const emptyForm = { name: "", email: "", phone: "", status: "prospect", monthlyRevenue: "" };

export default function ClientsPage() {
  const { data: clients, isLoading } = useListClients();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const createClient = useCreateClient({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListClientsQueryKey() }); setOpen(false); setForm(emptyForm); } } });
  const updateClient = useUpdateClient({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListClientsQueryKey() }); setOpen(false); } } });
  const deleteClient = useDeleteClient({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListClientsQueryKey() }) } });

  const filtered = clients?.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())) || [];

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ name: c.name, email: c.email, phone: c.phone || "", status: c.status, monthlyRevenue: c.monthlyRevenue || "" });
    setOpen(true);
  };

  const handleSubmit = () => {
    const payload = { name: form.name, email: form.email, phone: form.phone || undefined, status: form.status, monthlyRevenue: form.monthlyRevenue ? Number(form.monthlyRevenue) : undefined };
    if (editId) updateClient.mutate({ id: editId, data: payload });
    else createClient.mutate({ data: payload });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Clients</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{clients?.length || 0} total clients</p>
          </div>
          <Button size="sm" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />New Client
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="text-xs font-semibold">Company</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right">Monthly Revenue</TableHead>
                <TableHead className="text-xs font-semibold w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(4)].map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">No clients found</TableCell></TableRow>}
              {filtered.map(client => (
                <TableRow key={client.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(client)}>
                  <TableCell>
                    <div className="font-medium text-sm">{client.name}</div>
                    <div className="text-xs text-muted-foreground">{client.email}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{client.companyName || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs border capitalize", statusColors[client.status as keyof typeof statusColors] || "")}>
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-right font-medium">
                    {client.monthlyRevenue ? `$${Number(client.monthlyRevenue).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteClient.mutate({ id: client.id }); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setEditId(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Client" : "New Client"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Monthly Revenue ($)</Label><Input type="number" value={form.monthlyRevenue} onChange={e => setForm(f => ({ ...f, monthlyRevenue: e.target.value }))} /></div>
            {editId && <ActivityTimeline entityType="client" entityId={editId} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.email || createClient.isPending || updateClient.isPending}>
              {editId ? "Save Changes" : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
