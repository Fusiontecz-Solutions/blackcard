import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2, Plus, Search, Send } from "lucide-react";
import { toast } from "react-toastify";

import { axiosGet, axiosPost } from "@/redux/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTimeET } from "@/lib/utils";
import { normalizeE164 } from "@/voice/useAvochatoVoice";

export type DealSmsContact = {
  id: string;
  name: string;
  phone: string;
  subtitle: string;
};

type AvochatoTicket = {
  id?: string;
  contact?: string;
  status?: string;
  created_at?: number;
};

type AvochatoContact = {
  id?: string;
  name?: string;
  phone?: string;
};

type AvochatoEvent = Record<string, unknown>;

type Props = {
  dealContacts: DealSmsContact[];
  matchPhones: string[];
};

function digitsOnly(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

function last10(s: string): string {
  const d = digitsOnly(s);
  return d.length <= 10 ? d : d.slice(-10);
}

function eventTimeMs(ev: AvochatoEvent): number {
  const raw = Number(ev.sent_at ?? ev.created_at ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1e12 ? raw : raw * 1000;
}

function formatShortTime(ms: number): string {
  if (!ms) return "";
  try {
    return formatDateTimeET(ms);
  } catch {
    return "";
  }
}

function contactInitial(name: string): string {
  const t = String(name ?? "").trim();
  if (!t) return "?";
  return t.charAt(0).toUpperCase();
}

async function fetchJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const res = await axiosGet(path, { params });
  const body = res.data as { success?: boolean; message?: string };
  if (body && body.success === false) {
    throw new Error(typeof body.message === "string" ? body.message : "Request failed");
  }
  return res.data as T;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function PaymentDealSmsWorkspace({ dealContacts, matchPhones }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsBody, setSmsBody] = useState("");

  const [subdomain] = useState("");
  const [tickets, setTickets] = useState<AvochatoTicket[]>([]);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketHasMore, setTicketHasMore] = useState(true);
  const [contactsById, setContactsById] = useState<Record<string, AvochatoContact>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [events, setEvents] = useState<AvochatoEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [compose, setCompose] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const subdomainTrim = subdomain.trim();

  const matchLast10 = useMemo(() => {
    const set = new Set<string>();
    for (const p of matchPhones) {
      const t = last10(p);
      if (t.length >= 10) set.add(t);
    }
    return set;
  }, [matchPhones]);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetchJson<{ success?: boolean; configured?: boolean }>("/avochato-messaging/status");
      setConfigured(!!r?.configured);
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (dealContacts.length === 0) return;
    setSelectedDealId((prev) => {
      if (prev && dealContacts.some((c) => c.id === prev)) return prev;
      return dealContacts[0]?.id ?? null;
    });
  }, [dealContacts]);

  const selectedDealContact = useMemo(
    () => dealContacts.find((c) => c.id === selectedDealId) ?? null,
    [dealContacts, selectedDealId],
  );

  useEffect(() => {
    if (selectedTicketId || !selectedDealContact) return;
    setSmsPhone(selectedDealContact.phone);
  }, [selectedDealContact, selectedTicketId]);

  const searchLower = search.trim().toLowerCase();
  const filteredDealContacts = useMemo(() => {
    if (!searchLower) return dealContacts;
    return dealContacts.filter((c) => {
      const hay = `${c.name} ${c.phone} ${c.subtitle}`.toLowerCase();
      return hay.includes(searchLower) || digitsOnly(hay).includes(digitsOnly(searchLower));
    });
  }, [dealContacts, searchLower]);

  const loadTickets = useCallback(
    async (page: number, append: boolean) => {
      setTicketLoading(true);
      try {
        const r = await fetchJson<{
          success?: boolean;
          data?: { tickets?: AvochatoTicket[]; total_count?: number };
        }>("/avochato-messaging/tickets", {
          page,
          ...(subdomainTrim ? { subdomain: subdomainTrim } : {}),
        });
        const list = Array.isArray(r?.data?.tickets) ? r.data!.tickets! : [];
        const filtered = list.filter((t) => t?.id);
        let mergedCount = 0;
        setTickets((prev) => {
          let next: AvochatoTicket[];
          if (!append) {
            next = filtered;
          } else {
            const seen = new Set(prev.map((t) => String(t.id)));
            next = [...prev, ...filtered.filter((t) => !seen.has(String(t.id)))];
          }
          mergedCount = next.length;
          return next;
        });
        const total = typeof r?.data?.total_count === "number" ? r.data!.total_count! : null;
        if (total != null) {
          setTicketHasMore(mergedCount < total);
        } else {
          setTicketHasMore(filtered.length >= 30);
        }
        setTicketPage(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load inbox";
        toast.error(msg);
        if (!append) setTickets([]);
      } finally {
        setTicketLoading(false);
      }
    },
    [subdomainTrim],
  );

  useEffect(() => {
    if (configured !== true) return;
    setTickets([]);
    setContactsById({});
    setTicketHasMore(true);
    setSelectedTicketId(null);
    void loadTickets(1, false);
  }, [configured, subdomainTrim, loadTickets]);

  const contactIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tickets) {
      const c = String(t.contact ?? "").trim();
      if (c) ids.add(c);
    }
    return [...ids].sort().join(",");
  }, [tickets]);

  useEffect(() => {
    if (configured !== true || !contactIdsKey) return;
    const contactIds = contactIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    (async () => {
      const merged: Record<string, AvochatoContact> = {};
      for (const group of chunk(contactIds, 25)) {
        try {
          const r = await fetchJson<{ success?: boolean; data?: { contacts?: AvochatoContact[] } }>(
            "/avochato-messaging/contacts",
            {
              ids: group.join(","),
              ...(subdomainTrim ? { subdomain: subdomainTrim } : {}),
            },
          );
          const list = Array.isArray(r?.data?.contacts) ? r.data!.contacts! : [];
          for (const c of list) {
            const id = String(c?.id ?? "").trim();
            if (id) merged[id] = c;
          }
        } catch {
          /* ignore partial */
        }
      }
      if (!cancelled) setContactsById((prev) => ({ ...prev, ...merged }));
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, contactIdsKey, subdomainTrim]);

  const loadConversation = useCallback(
    async (ticketId: string) => {
      setEventsLoading(true);
      try {
        const r = await fetchJson<{ success?: boolean; data?: { events?: AvochatoEvent[] } }>(
          `/avochato-messaging/tickets/${encodeURIComponent(ticketId)}/conversation`,
          subdomainTrim ? { subdomain: subdomainTrim } : {},
        );
        const list = Array.isArray(r?.data?.events) ? r.data!.events! : [];
        setEvents(list);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load conversation";
        toast.error(msg);
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    },
    [subdomainTrim],
  );

  useEffect(() => {
    if (!selectedTicketId) {
      setEvents([]);
      return;
    }
    void loadConversation(selectedTicketId);
  }, [selectedTicketId, loadConversation]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, selectedTicketId]);

  useEffect(() => {
    if (configured !== true || selectedTicketId || tickets.length === 0) return;
    for (const t of tickets) {
      const tid = String(t.id ?? "").trim();
      const cid = String(t.contact ?? "").trim();
      if (!tid || !cid) continue;
      const phone = String(contactsById[cid]?.phone ?? "").trim();
      if (phone && matchLast10.has(last10(phone))) {
        setSelectedTicketId(tid);
        setSelectedDealId(null);
        break;
      }
    }
  }, [configured, tickets, contactsById, matchLast10, selectedTicketId]);

  const selectedInboxContact = useMemo(() => {
    if (!selectedTicketId) return null;
    const ticket = tickets.find((x) => String(x.id) === selectedTicketId);
    const cid = String(ticket?.contact ?? "").trim();
    if (!cid) return null;
    return contactsById[cid] ?? null;
  }, [selectedTicketId, tickets, contactsById]);

  const filteredTickets = useMemo(() => {
    if (!searchLower) return tickets;
    return tickets.filter((t) => {
      const cid = String(t.contact ?? "").trim();
      const c = cid ? contactsById[cid] : undefined;
      const title = [c?.name, c?.phone].map((x) => String(x ?? "").trim()).join(" ");
      return title.toLowerCase().includes(searchLower) || digitsOnly(title).includes(digitsOnly(searchLower));
    });
  }, [tickets, contactsById, searchLower]);

  const selectDealContact = (id: string) => {
    setSelectedTicketId(null);
    setSelectedDealId(id);
    const c = dealContacts.find((x) => x.id === id);
    if (c) setSmsPhone(c.phone);
  };

  const selectTicket = (id: string) => {
    setSelectedDealId(null);
    setSelectedTicketId(id);
  };

  const onNewChat = () => {
    setSelectedTicketId(null);
    setSelectedDealId(null);
    setSmsPhone("");
    setSmsBody("");
  };

  const copySmsDraft = async () => {
    const to = normalizeE164(smsPhone) || smsPhone.trim();
    if (!to) {
      toast.error("Enter a phone number first.");
      return;
    }
    const body = smsBody.trim();
    const block = body ? `To: ${to}\n\n${body}` : `To: ${to}`;
    try {
      await navigator.clipboard.writeText(block);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — check browser permissions.");
    }
  };

  const smsDeviceHref = useMemo(() => {
    const to = normalizeE164(smsPhone);
    if (!to) return null;
    const body = smsBody.trim();
    const q = body ? `?body=${encodeURIComponent(body)}` : "";
    return `sms:${to}${q}`;
  }, [smsPhone, smsBody]);

  const postAvochatoSms = async (phone: string, message: string) => {
    await axiosPost("/avochato-messaging/messages", {
      phone,
      message,
      markAddressed: true,
      ...(subdomainTrim ? { subdomain: subdomainTrim } : {}),
    });
  };

  const sendInboxMessage = async () => {
    const phone = String(selectedInboxContact?.phone ?? "").trim();
    const text = compose.trim();
    if (!selectedTicketId) {
      toast.error("Select a conversation first.");
      return;
    }
    if (!phone) {
      toast.error("This ticket has no contact phone.");
      return;
    }
    if (!text) return;
    setSendLoading(true);
    try {
      await postAvochatoSms(phone, text);
      setCompose("");
      toast.success("Message sent");
      await loadConversation(selectedTicketId);
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { message?: string } } })?.response?.data;
      toast.error(typeof data?.message === "string" ? data.message : "Send failed");
    } finally {
      setSendLoading(false);
    }
  };

  const sendComposeSms = async () => {
    const phone = normalizeE164(smsPhone) || smsPhone.trim();
    const text = smsBody.trim();
    if (!phone) {
      toast.error("Enter a phone number first.");
      return;
    }
    if (!text) {
      toast.error("Message cannot be empty.");
      return;
    }
    setSendLoading(true);
    try {
      await postAvochatoSms(phone, text);
      setSmsBody("");
      toast.success("Message sent");
      if (configured) {
        setSelectedTicketId(null);
        await loadTickets(1, false);
      }
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { message?: string } } })?.response?.data;
      toast.error(typeof data?.message === "string" ? data.message : "Send failed");
    } finally {
      setSendLoading(false);
    }
  };

  const composerTitle = selectedInboxContact
    ? String(selectedInboxContact.name ?? selectedInboxContact.phone ?? "Conversation")
    : selectedDealContact?.name ?? "Compose SMS";
  const composerSubtitle = selectedInboxContact
    ? String(selectedInboxContact.phone ?? "")
    : selectedDealContact?.subtitle ?? "";

  if (configured === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Checking SMS inbox…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {configured === false ? (
        <p className="rounded-xl border border-amber-200/80 bg-[#fff8e8] px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
          SMS inbox is not linked for your organization yet. You can still message people using the phone
          numbers saved on this deal. When inbox is connected, your full conversation history will appear here.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex min-h-[440px] flex-col md:flex-row">
          <aside className="flex w-full shrink-0 flex-col border-b border-border/60 md:w-[min(100%,300px)] md:border-b-0 md:border-r dark:border-white/10">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 dark:border-white/10">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Chats
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand)]/10 hover:text-[var(--brand)] dark:text-[#C07BE0]"
                onClick={onNewChat}
              >
                <Plus className="size-3.5" aria-hidden />
                New
              </Button>
            </div>
            <div className="border-b border-border/60 px-3 py-2 dark:border-white/10">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search people or numbers"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 bg-muted/30 pl-8 text-sm dark:bg-white/[0.04]"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredDealContacts.length > 0 ? (
                <ul>
                  {filteredDealContacts.map((c) => {
                    const active = !selectedTicketId && c.id === selectedDealId;
                    const matched = matchLast10.has(last10(c.phone));
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectDealContact(c.id)}
                          className={cn(
                            "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
                            active
                              ? "bg-[var(--brand)]/10 dark:bg-[var(--brand)]/18"
                              : "hover:bg-muted/40 dark:hover:bg-white/[0.04]",
                          )}
                        >
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--brand-gradient)] text-sm font-semibold text-white"
                            aria-hidden
                          >
                            {contactInitial(c.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-foreground">{c.name}</span>
                              {matched ? (
                                <span
                                  className="size-1.5 shrink-0 rounded-full bg-[image:var(--brand-gradient)]"
                                  title="On this deal"
                                  aria-hidden
                                />
                              ) : null}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {c.phone}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">{c.subtitle}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : dealContacts.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No phone numbers on file for this deal.
                </p>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
              )}

              {configured && filteredTickets.length > 0 ? (
                <>
                  <p className="border-t border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:border-white/10">
                    Inbox
                  </p>
                  <ul className="divide-y divide-border/50 dark:divide-white/10">
                    {filteredTickets.map((t) => {
                      const id = String(t.id ?? "");
                      const cid = String(t.contact ?? "");
                      const contact = cid ? contactsById[cid] : undefined;
                      const title =
                        [contact?.name, contact?.phone]
                          .map((x) => String(x ?? "").trim())
                          .find(Boolean) ?? "Conversation";
                      const sub = String(contact?.phone ?? "").trim();
                      const active = id === selectedTicketId;
                      const matched = sub && matchLast10.has(last10(sub));
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => selectTicket(id)}
                            className={cn(
                              "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors",
                              active
                                ? "bg-[var(--brand)]/12 dark:bg-[var(--brand)]/20"
                                : "hover:bg-muted/50 dark:hover:bg-white/[0.04]",
                            )}
                          >
                            <span className="flex items-center gap-2 font-medium">
                              {matched ? (
                                <span
                                  className="size-1.5 shrink-0 rounded-full bg-[image:var(--brand-gradient)]"
                                  title="Matches this deal"
                                  aria-hidden
                                />
                              ) : null}
                              <span className="truncate">{title}</span>
                            </span>
                            {sub ? (
                              <span className="truncate font-mono text-xs text-muted-foreground">{sub}</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {ticketHasMore ? (
                    <div className="border-t border-border/60 p-2 dark:border-white/10">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        disabled={ticketLoading}
                        onClick={() => void loadTickets(ticketPage + 1, true)}
                      >
                        {ticketLoading ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : configured && ticketLoading && tickets.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading inbox…
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selectedTicketId ? (
              <>
                <div className="border-b border-border/60 px-4 py-3 dark:border-white/10">
                  <p className="text-base font-semibold text-foreground">{composerTitle}</p>
                  {composerSubtitle ? (
                    <p className="font-mono text-xs text-muted-foreground">{composerSubtitle}</p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {eventsLoading ? (
                    <div className="flex justify-center py-8 text-muted-foreground">
                      <Loader2 className="size-6 animate-spin" aria-hidden />
                    </div>
                  ) : (
                    events.map((ev, idx) => {
                      const type = String(ev.element_type ?? "");
                      const key = String(ev.event_id ?? ev.uuid ?? idx);
                      if (type === "SmsMessage") {
                        const dir = String(ev.direction ?? "");
                        const outbound = dir === "out";
                        const text = String(ev.message ?? "");
                        const ts = eventTimeMs(ev);
                        return (
                          <div key={key} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                                outbound
                                  ? "rounded-br-md bg-[image:var(--brand-gradient)] text-white"
                                  : "rounded-bl-md border border-border/60 bg-muted/40 text-foreground dark:border-white/10 dark:bg-white/[0.06]",
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">{text || "—"}</p>
                              <p
                                className={cn(
                                  "mt-1 text-[10px]",
                                  outbound ? "text-white/80" : "text-muted-foreground",
                                )}
                              >
                                {formatShortTime(ts)}
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })
                  )}
                  <div ref={threadEndRef} />
                </div>
                <div className="border-t border-border/60 p-3 dark:border-white/10">
                  <Textarea
                    placeholder="Type a message…"
                    value={compose}
                    onChange={(e) => setCompose(e.target.value)}
                    disabled={sendLoading}
                    rows={3}
                    className="mb-2 min-h-[72px] resize-none text-sm"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-[image:var(--brand-gradient)] hover:bg-[#215a84]"
                      disabled={!compose.trim() || sendLoading}
                      onClick={() => void sendInboxMessage()}
                    >
                      {sendLoading ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="size-4" aria-hidden />
                      )}
                      Send
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-border/60 px-4 py-3 dark:border-white/10">
                  <p className="text-base font-semibold text-foreground">
                    {selectedDealContact ? composerTitle : "Compose SMS"}
                  </p>
                  {composerSubtitle ? (
                    <p className="text-xs text-muted-foreground">{composerSubtitle}</p>
                  ) : null}
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {configured
                      ? "Send through your connected SMS inbox, or copy the message to use elsewhere."
                      : "Write your message here, then copy it or open the SMS app on your phone."}
                  </p>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
                  <div className="grid gap-1.5">
                    <label htmlFor="deal-sms-phone" className="text-sm font-medium text-foreground">
                      Phone number
                    </label>
                    <Input
                      id="deal-sms-phone"
                      placeholder="+14155552671"
                      value={smsPhone}
                      onChange={(e) => setSmsPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="grid flex-1 gap-1.5">
                    <label htmlFor="deal-sms-body" className="text-sm font-medium text-foreground">
                      Message
                    </label>
                    <Textarea
                      id="deal-sms-body"
                      placeholder="Write your SMS…"
                      value={smsBody}
                      onChange={(e) => setSmsBody(e.target.value)}
                      disabled={sendLoading}
                      rows={8}
                      className="min-h-[160px] resize-y"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {configured ? (
                      <Button
                        type="button"
                        variant="default"
                        className="gap-2 bg-[image:var(--brand-gradient)] hover:bg-[#215a84]"
                        disabled={!smsBody.trim() || !smsPhone.trim() || sendLoading}
                        onClick={() => void sendComposeSms()}
                      >
                        {sendLoading ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Send className="size-4" aria-hidden />
                        )}
                        Send
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant={configured ? "outline" : "default"}
                      className={cn(
                        "gap-2",
                        !configured && "bg-[image:var(--brand-gradient)] hover:bg-[#215a84]",
                      )}
                      disabled={sendLoading}
                      onClick={() => void copySmsDraft()}
                    >
                      <Copy className="size-4" aria-hidden />
                      Copy draft
                    </Button>
                    {!configured && smsDeviceHref ? (
                      <Button type="button" variant="outline" asChild>
                        <a href={smsDeviceHref}>Open SMS app</a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
