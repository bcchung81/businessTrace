export function SignOutForm({ action }: { action: () => void | Promise<void> }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="border-[1.5px] border-band-foreground/30 px-2 py-1 text-[11px] font-bold text-band-foreground transition-colors hover:border-band-foreground/70"
      >
        로그아웃
      </button>
    </form>
  );
}
