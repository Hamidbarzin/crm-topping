import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useListCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany } from "@workspace/api-client-react";
import { getListCompaniesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Trash2, Globe } from "lucide-react";

const emptyForm = { name: "", industry: "", website: "", phone: "", notes: "" };

export default function CompaniesPage() {
  const { data: companies, isLoading } = useListCompanies();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const createCompany = useCreateCompany({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() }); setOpen(false); setForm(emptyForm); } } });
  const updateCompany = useUpdateCompany({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() }); setOpen(false); } } });
  const deleteCompany = useDeleteCompany({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() }) } });

  const filtered = companies?.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) || [];
  const openEdit = (c: any) => { setEditId(c.id); setForm({ name: c.name, industry: c.industry || "", website: c.website || "", phone: c.phone || "", notes: c.notes || "" }); setOpen(true); };
  const handleSubmit = () => {
    const payload = { name: form.name, industry: form.industry || undefined, website: form.website || undefined, phone: form.phone || undefined, notes: form.notes || undefined };
    if (editId) updateCompany.mutate({ id: editId, data: payload });
    else createCompany.mutate({ data: payload });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Companies</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{companies?.length || 0} companies</p>
          </div>
          <Button size="sm" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />New Company
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="text-xs font-semibold">Industry</TableHead>
                <TableHead className="text-xs font-semibold">Website</TableHead>
                <TableHead className="text-xs font-semibold">Phone</TableHead>
                <TableHead className="text-xs font-semibold w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(4)].map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">No companies yet</TableCell></TableRow>}
              {filtered.map(company => (
                <TableRow key={company.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(company)}>
                  <TableCell className="font-medium text-sm">{company.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{company.industry || "—"}</TableCell>
                  <TableCell>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={e => e.stopPropagation()}>
                        <Globe className="w-3 h-3" />{company.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{company.phone || "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteCompany.mutate({ id: company.id }); }}>
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
          <DialogHeader><DialogTitle>{editId ? "Edit Company" : "New Company"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Industry</Label><Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Website</Label><Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || createCompany.isPending || updateCompany.isPending}>
              {editId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
