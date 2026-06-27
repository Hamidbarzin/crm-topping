import { useState, useRef, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAskAssistant } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How many deals have I won and what's my total revenue?",
  "What's my current pipeline value?",
  "What's my close rate so far?",
  "How many active clients do I have and their monthly revenue?",
];

export default function AssistantPage() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const ask = useAskAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  const send = (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    ask.mutate(
      { data: { question: q } },
      {
        onSuccess: (res) => {
          setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
        },
        onError: () => {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Sorry, I couldn't get an answer right now. Please try again." },
          ]);
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 px-1 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AI Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Ask about your leads, deals, revenue and KPIs. Read-only — it won't change any data.
            </p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 px-1 pb-4">
          {messages.length === 0 && !ask.isPending && (
            <div className="flex flex-col items-center justify-center text-center py-12 gap-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <p className="font-medium">Hi {user?.name?.split(" ")[0] || "there"} — what would you like to know?</p>
                <p className="text-sm text-muted-foreground mt-1">Try one of these to get started:</p>
              </div>
              <div className="grid gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-sm rounded-lg border bg-card px-4 py-3 hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  m.role === "user" ? "bg-muted" : "bg-primary/10 text-primary",
                )}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <Card
                className={cn(
                  "px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-w-[85%]",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {m.content}
              </Card>
            </div>
          ))}

          {ask.isPending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <Card className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </Card>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t pt-3 px-1">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask a question about your CRM data…"
            className="min-h-[44px] max-h-32 resize-none"
            disabled={ask.isPending}
          />
          <Button type="submit" size="icon" disabled={ask.isPending || !input.trim()} className="h-11 w-11 shrink-0">
            {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
