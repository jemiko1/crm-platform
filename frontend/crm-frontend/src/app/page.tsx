// frontend/crm-frontend/src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Top Nav */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-zinc-900" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">CRM Platform</div>
              <div className="text-xs text-zinc-500">
                Buildings • Work Orders • Inventory
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-medium border hover:bg-zinc-50"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="mx-auto max-w-7xl px-4 pt-14 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-zinc-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Enterprise-ready CRM foundation
              </div>

              <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
                Run building operations with clarity.
              </h1>

              <p className="mt-4 text-base md:text-lg text-zinc-600 leading-relaxed">
                A clean, fast CRM for managing buildings, assets, work orders,
                and inventory — designed for daily operations and measurable
                performance.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-900 text-white px-5 py-3 text-sm font-medium hover:bg-zinc-800"
                >
                  Sign in
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-medium hover:bg-zinc-50"
                >
                  See features
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MiniStat title="Work orders" value="Dispatch & track" />
                <MiniStat title="Assets" value="Central registry" />
                <MiniStat title="Inventory" value="Stock alerts" />
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-2xl border bg-zinc-50 p-4 md:p-6">
                <div className="rounded-2xl bg-white border shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        Dashboard preview
                      </div>
                      <div className="text-xs text-zinc-500">
                        Sample layout (UI-first)
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">Live soon</div>
                  </div>

                  <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PreviewCard title="Active work orders" value="9" hint="2 overdue" />
                    <PreviewCard title="Buildings" value="18" hint="4 with open issues" />
                    <PreviewCard title="Inventory alerts" value="3" hint="restock needed" />
                    <PreviewCard title="This week" value="26 tasks" hint="+6 vs last week" />
                  </div>

                  <div className="px-5 pb-5">
                    <div className="h-36 rounded-xl border bg-zinc-50 flex items-center justify-center text-sm text-zinc-500">
                      Chart placeholder
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-zinc-500">
                Responsive layout • Clean enterprise UI • Fast workflows
              </div>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y bg-zinc-50">
          <div className="mx-auto max-w-7xl px-4 py-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TrustItem title="Secure by default" desc="httpOnly auth cookie + protected routes." />
            <TrustItem title="Operational focus" desc="Built around dispatch, repair, and inventory." />
            <TrustItem title="Modern UX" desc="Fast, responsive, and easy to scale." />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-7xl px-4 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-semibold text-zinc-900">
              Everything your team needs — without clutter.
            </h2>
            <p className="mt-3 text-zinc-600">
              Clear modules, predictable workflows, and a UI that supports speed.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              title="Buildings"
              desc="Maintain building profiles, addresses, and asset relationships."
            />
            <FeatureCard
              title="Assets"
              desc="Track elevators, doors, intercoms and other equipment."
            />
            <FeatureCard
              title="Work orders"
              desc="Dispatch, assign, and complete install/repair/diagnostic jobs."
            />
            <FeatureCard
              title="Inventory"
              desc="Stock levels, alerts, and movement history (coming next)."
            />
            <FeatureCard
              title="Roles & permissions"
              desc="Admin, technician, call center, warehouse, manager."
            />
            <FeatureCard
              title="Audit-ready"
              desc="Designed for traceability and consistent processes."
            />
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <div className="rounded-2xl border bg-zinc-900 text-white p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="text-xl md:text-2xl font-semibold">
                Ready to continue building your CRM?
              </h3>
              <p className="mt-2 text-white/80 text-sm">
                Sign in to the workspace and we’ll build modules step by step.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-white text-zinc-900 px-5 py-3 text-sm font-medium hover:bg-zinc-100"
            >
              Go to login
            </Link>
          </div>

          <footer className="mt-10 text-xs text-zinc-500">
            © {new Date().getFullYear()} CRM Platform • Built for operations
          </footer>
        </section>
      </main>
    </div>
  );
}

function MiniStat(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs text-zinc-500">{props.title}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">
        {props.value}
      </div>
    </div>
  );
}

function PreviewCard(props: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs text-zinc-500">{props.title}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900">
        {props.value}
      </div>
      <div className="mt-2 text-xs text-zinc-500">{props.hint}</div>
    </div>
  );
}

function TrustItem(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="text-sm font-semibold text-zinc-900">{props.title}</div>
      <div className="mt-2 text-sm text-zinc-600">{props.desc}</div>
    </div>
  );
}

function FeatureCard(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="text-sm font-semibold text-zinc-900">{props.title}</div>
      <div className="mt-2 text-sm text-zinc-600 leading-relaxed">
        {props.desc}
      </div>
    </div>
  );
}
