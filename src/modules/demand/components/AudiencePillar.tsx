"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { DEMO_CONTACTS } from "../data";
import { createGroup, toggleFavorite, useFavorites, useGroups } from "../store";
import type { DemandContact, DemandGroup } from "../types";
import { Checkbox, PillarHeader, SearchField, StarButton, initials } from "./ui";

type Tab = "favorites" | "groups" | "contacts";

/**
 * Pillar 2 — who gets the poll. Favorites (starred groups and contacts) come
 * first so the usual audience is one click. Picking a group adds all its
 * members; a contact in several groups is still only counted once.
 */
export function AudiencePillar({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const favorites = useFavorites();
  const groups = useGroups();
  const [tab, setTab] = useState<Tab>("favorites");
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  const [groupName, setGroupName] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);

  const groupCount = useMemo(() => {
    const counts = new Map<string, number>();
    groups.forEach((g) => g.memberIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
    return counts;
  }, [groups]);

  const favGroups = groups.filter((g) => favorites.includes(g.id) && matches(g.name));
  const favContacts = DEMO_CONTACTS.filter(
    (c) => favorites.includes(c.id) && (matches(c.name) || matches(c.company)),
  );
  const shownGroups = groups.filter((g) => matches(g.name));
  const shownContacts = DEMO_CONTACTS.filter((c) => matches(c.name) || matches(c.company) || matches(c.city));

  function toggleContact(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function groupState(g: DemandGroup): "on" | "off" | "some" {
    const n = g.memberIds.filter((id) => selected.has(id)).length;
    return n === 0 ? "off" : n === g.memberIds.length ? "on" : "some";
  }

  function toggleGroup(g: DemandGroup) {
    const next = new Set(selected);
    if (groupState(g) === "on") g.memberIds.forEach((id) => next.delete(id));
    else g.memberIds.forEach((id) => next.add(id));
    onChange(next);
  }

  function saveGroup() {
    const name = groupName.trim();
    if (!name || selected.size === 0) return;
    const g = createGroup(name, [...selected]);
    toggleFavorite(g.id);
    setNaming(false);
    setGroupName("");
  }

  const groupRow = (g: DemandGroup) => (
    <GroupRow
      key={g.id}
      group={g}
      state={groupState(g)}
      starred={favorites.includes(g.id)}
      onToggle={() => toggleGroup(g)}
    />
  );
  const contactRow = (c: DemandContact) => (
    <ContactRow
      key={c.id}
      contact={c}
      on={selected.has(c.id)}
      starred={favorites.includes(c.id)}
      groups={groupCount.get(c.id) ?? 0}
      onToggle={() => toggleContact(c.id)}
    />
  );

  return (
    <section className="glass flex min-h-0 flex-col rounded-3xl p-4">
      <PillarHeader n={2} title="Who" hint={`${selected.size} selected`} />

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-ink/5 p-1">
        {(["favorites", "groups", "contacts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg py-1 text-xs font-semibold capitalize transition ${
              tab === t ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search people, pharmacies, groups"
          icon={<Search size={14} className="text-ink-muted" />}
        />
      </div>

      <ul className="mt-2 flex h-[300px] flex-col overflow-auto pr-1">
        {tab === "favorites" && (
          <>
            {favGroups.map(groupRow)}
            {favContacts.map(contactRow)}
            {favGroups.length + favContacts.length === 0 && (
              <li className="px-2 py-6 text-center text-xs text-ink-muted">
                Star a group or contact to keep it here.
              </li>
            )}
          </>
        )}
        {tab === "groups" && shownGroups.map(groupRow)}
        {tab === "contacts" && shownContacts.map(contactRow)}
      </ul>

      <div className="mt-2 min-h-[30px]">
        {naming ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveGroup()}
              placeholder="Group name"
              className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs outline-none focus:border-brand/40"
            />
            <button
              type="button"
              onClick={saveGroup}
              disabled={!groupName.trim()}
              className="rounded-lg bg-brand px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-deep disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setNaming(false)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          selected.size > 0 && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setNaming(true)}
                className="flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline"
              >
                <Users size={13} /> Save {selected.size} as group
              </button>
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-xs font-semibold text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function GroupRow({
  group,
  state,
  starred,
  onToggle,
}: {
  group: DemandGroup;
  state: "on" | "off" | "some";
  starred: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${
          state !== "off" ? "bg-brand/[0.07]" : "hover:bg-black/[0.03]"
        }`}
      >
        <Checkbox state={state} />
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
          <Users size={14} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-ink">{group.name}</span>
          <span className="block text-[11px] text-ink-muted">{group.memberIds.length} contacts</span>
        </span>
        <StarButton on={starred} onClick={() => toggleFavorite(group.id)} label={group.name} />
      </div>
    </li>
  );
}

function ContactRow({
  contact,
  on,
  starred,
  groups,
  onToggle,
}: {
  contact: DemandContact;
  on: boolean;
  starred: boolean;
  groups: number;
  onToggle: () => void;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${
          on ? "bg-brand/[0.07]" : "hover:bg-black/[0.03]"
        }`}
      >
        <Checkbox state={on ? "on" : "off"} />
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft/60 text-[10px] font-bold text-brand-deep">
          {initials(contact.name)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-ink">{contact.name}</span>
          <span className="block truncate text-[11px] text-ink-muted">
            {contact.company} · {contact.city}
            {groups > 1 ? ` · ${groups} groups` : ""}
          </span>
        </span>
        <StarButton on={starred} onClick={() => toggleFavorite(contact.id)} label={contact.name} />
      </div>
    </li>
  );
}
