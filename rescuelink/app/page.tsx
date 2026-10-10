import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-16 font-sans">
      <h1 className="text-3xl font-semibold tracking-tight">RescueLink</h1>
      <Link className="text-lg underline" href="/test">
        Open the test UI → /test
      </Link>
    </main>
  );
}
