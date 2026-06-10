// Reusable identity avatar: photo with an initials fallback. No hooks, so it
// works in both server and client components (onboarding, account, card, page).
export function Avatar({ url, name, size = 72 }: { url: string | null; name: string; size?: number }) {
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-brand/60"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center bg-brand font-semibold text-white"
        style={{ fontSize: size * 0.34 }}
      >
        {initials}
      </span>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="relative h-full w-full object-cover" />
      )}
    </span>
  )
}
