export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-1 text-lg font-bold">EcoSphere Pulse</div>
        <p className="mb-5 text-sm text-muted-foreground">Enter the access password to continue.</p>
        <form action="/api/login" method="POST" className="space-y-3">
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {searchParams?.error ? (
            <p className="text-sm text-red-600">Incorrect password.</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
