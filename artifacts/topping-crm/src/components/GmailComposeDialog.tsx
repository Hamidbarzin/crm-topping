import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/api";
import { Mail, Send, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
}

export default function GmailComposeDialog({ open, onClose, defaultTo = "", defaultSubject = "", defaultBody = "" }: Props) {
  const { toast } = useToast();
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  const handleOpen = (v: boolean) => {
    if (!v) { onClose(); }
  };

  const send = async () => {
    if (!to || !subject || !body) {
      toast({ title: "Missing fields", description: "To, subject and body are required.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/google/gmail/send", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      toast({ title: "Email sent", description: `Delivered to ${to}` });
      onClose();
    } catch (e: unknown) {
      toast({ title: "Failed to send", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-red-400" />
            New Email (Gmail)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
            <Input
              placeholder="recipient@example.com"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Subject</Label>
            <Input
              placeholder="Subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Message</Label>
            <Textarea
              placeholder="Write your message..."
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
