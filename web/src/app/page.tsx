import { strings } from "@/i18n/strings";

const locale = "id";
const t = strings[locale].landing;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 text-center">
      <main className="flex flex-col items-center gap-6">
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
          {t.title}
        </h1>
        <p className="max-w-md text-lg text-zinc-400">{t.tagline}</p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <a
            href="#"
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            {t.ctaGuest}
          </a>
          <a
            href="#"
            className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500 hover:bg-zinc-900"
          >
            {t.ctaConnectWallet}
          </a>
        </div>
      </main>
    </div>
  );
}
