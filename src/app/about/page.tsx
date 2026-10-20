import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Download,
  FileText,
  Layers,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/features/auth/auth";
import { Header } from "@/components/core/Header";

// Feature card component
function FeatureCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 shadow-sm">
      <div className="bg-white p-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-un-blue/10">
            <Icon className="h-5 w-5 text-un-blue" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-gray-600">{description}</p>
      </div>
      {children && (
        <div className="flex flex-1 items-center border-t border-gray-100 p-4">
          <div className="w-full">{children}</div>
        </div>
      )}
    </div>
  );
}

// Mini mockup: Entity card
function MockEntityCard({
  name,
  count,
  highlight,
}: {
  name: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 ${highlight ? "bg-un-blue/10 ring-1 ring-un-blue/30" : "bg-gray-100"}`}
    >
      <span className="text-xs font-medium text-gray-700">{name}</span>
      <span className="text-xs text-gray-400">{count}</span>
    </div>
  );
}

// Mini mockup: Decision dropdown
function MockDecision({
  decision,
  color,
}: {
  decision: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    retain: "bg-blue-50 text-blue-700 border-blue-200",
    remove: "bg-red-50 text-red-700 border-red-200",
    update: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <div
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${colors[color]}`}
    >
      {decision}
      <ChevronDown className="h-2.5 w-2.5 opacity-60" />
    </div>
  );
}

// Mini mockup: Mandate row
function MockMandateRow({
  symbol,
  title,
  year,
  decision,
}: {
  symbol: string;
  title: string;
  year: number;
  decision?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-2 text-xs shadow-sm">
      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-un-blue">
        {symbol}
      </span>
      <span className="flex-1 truncate text-gray-600">{title}</span>
      <span className="text-gray-400">{year}</span>
      {decision && (
        <MockDecision decision={decision} color={decision.toLowerCase()} />
      )}
    </div>
  );
}

// Mini mockup: Search result
function MockSearchResult({
  symbol,
  title,
}: {
  symbol: string;
  title: string;
}) {
  return (
    <div className="border-b border-gray-100 px-3 py-2 last:border-0 hover:bg-gray-50">
      <span className="text-xs font-medium text-un-blue">{symbol}</span>
      <div className="truncate text-[10px] text-gray-500">{title}</div>
    </div>
  );
}

// Mini mockup: Warning badge
function MockWarning({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs">
        {icon}
      </span>
      <span className="text-xs text-amber-700">{text}</span>
    </div>
  );
}

export default async function AboutPage() {
  const user = await getCurrentUser();
  const isLoggedIn = !!user;
  const ctaHref = isLoggedIn ? "/" : "/login";

  return (
    <>
      <Header user={user} maxWidth="6xl" hideAbout />
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">
            Streamline Your Mandate Citation Review
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-600">
            The Mandate Housekeeping Platform is being tested as a pilot tool to
            support UN Secretariat entities review and update mandate citations
            for the 2027 Proposed Programme Budget (PPB) – Programme Plan.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-lg bg-un-blue px-6 py-3 font-medium text-white transition-colors hover:bg-un-blue/90"
            >
              {isLoggedIn ? "Go to Dashboard" : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Explore Features
            </a>
          </div>
        </section>

        {/* Feature grid */}
        <section id="features" className="mx-auto max-w-6xl px-4 pb-20">
          <h3 className="mb-8 text-center text-base font-semibold tracking-wider text-gray-400 uppercase">
            Platform Features
          </h3>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 1. Find Your Entity */}
            <FeatureCard
              icon={Building2}
              title="Find Your Entity"
              description="Browse entities, search by name or use the My Entity shortcut."
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400">
                    Search entities...
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MockEntityCard name="OIOS" count={42} highlight />
                  <MockEntityCard name="DPPA" count={38} />
                  <MockEntityCard name="DPO" count={67} />
                  <MockEntityCard name="OHCHR" count={54} />
                </div>
              </div>
            </FeatureCard>

            {/* 2. All Mandates at a Glance */}
            <FeatureCard
              icon={FileText}
              title="Mandates at a Glance"
              description="View all mandates for your entity in the familiar PPB structure. Sort by symbol, title, body, year, or how many other entities share the citation."
            >
              <div className="space-y-2">
                <div className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
                  Subprogramme 1
                </div>
                <MockMandateRow
                  symbol="A/RES/79/1"
                  title="The Pact for the Future"
                  year={2024}
                  decision="Retain"
                />
                <MockMandateRow
                  symbol="A/RES/65/259"
                  title="Programme budget for the biennium 2010-2011"
                  year={2010}
                  decision="Update"
                />
              </div>
            </FeatureCard>

            {/* 3. Mark Your Housekeeping Decisions */}
            <FeatureCard
              icon={Check}
              title="Record Your Housekeeping Actions"
              description="Record whether each mandate is retained, updated or removed and indicate a reason for your decision for review and validation."
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Decision:</span>
                  <MockDecision decision="Retain" color="retain" />
                </div>
                <div className="flex items-center gap-2">
                  <MockDecision decision="Remove" color="remove" />
                </div>
                <div className="flex items-center gap-2">
                  <MockDecision decision="Update" color="update" />
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-blue-50/50 p-2 text-[10px] text-gray-500">
                <MessageSquare className="mr-1 mb-0.5 inline h-3 w-3" />
                Reason: Mandate continues to be relevant for the entity&apos;s
                work.
              </div>
            </FeatureCard>

            {/* 4. Search the Official Document System */}
            <FeatureCard
              icon={Search}
              title="Search the UN's Official Document System (ODS)"
              description="Add or update mandate citations using validated data from the UN Digital Library and ODS. Search by symbol or title to add a record and its metadata including title, year, issuing body and a PDF link."
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-3 py-2">
                  <Plus className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400">
                    Add mandate — search by symbol or title...
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <MockSearchResult
                    symbol="A/RES/79/18"
                    title="Weapons of mass destruction in outer space"
                  />
                  <MockSearchResult
                    symbol="A/RES/79/19"
                    title="Preventing an arms race in outer space"
                  />
                </div>
              </div>
            </FeatureCard>

            {/* 5. Built-In Approval Process */}
            <FeatureCard
              icon={Check}
              title="Built-In Validation Process"
              description="PPBD will help support a harmonization of approaches to mandate citations across all entities and validate that lists of legislative mandates are accurate and up-to-date. Validation status is visible to all, ensuring transparency in the review cycle."
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <MockDecision decision="Retain" color="retain" />
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  Approved by reviewer@un.org
                </span>
              </div>
            </FeatureCard>

            {/* 6. Discuss and Coordinate */}
            <FeatureCard
              icon={MessageSquare}
              title="Mandate Coordination"
              description="Add comments on a mandate to flag issues or support discussion and coordination among entities citing the same mandate."
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded p-2 shadow-sm">
                  <MessageSquare className="mt-0.5 h-3 w-3 text-amber-500" />
                  <div>
                    <p className="text-xs text-gray-700">
                      Should we align our decision with DPPA on this shared
                      mandate?
                    </p>
                    <p className="mt-1 text-[10px] text-gray-400">
                      focal.point@un.org · Jan 15
                    </p>
                  </div>
                </div>
              </div>
            </FeatureCard>

            {/* 7. Deep Dive Into Any Document */}
            <FeatureCard
              icon={Layers}
              title="Deep Dive Into Document Details"
              description="Click a document to open a detailed view with metadata, version history, full document text, and any recorded actions and comments from all entities."
            >
              <div className="space-y-2">
                <div className="flex gap-1">
                  {["Info", "Decisions", "Activity", "Paragraphs"].map(
                    (tab, i) => (
                      <span
                        key={tab}
                        className={`rounded-t px-2 py-1 text-[10px] font-medium ${i === 0 ? "bg-white text-gray-700" : "text-gray-400"}`}
                      >
                        {tab}
                      </span>
                    ),
                  )}
                </div>
                <div className="rounded p-2 text-xs shadow-sm">
                  <div className="flex items-center justify-between text-gray-500">
                    <span>Year</span>
                    <span className="font-medium text-gray-700">2024</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-gray-500">
                    <span>Issuing body</span>
                    <span className="font-medium text-gray-700">
                      General Assembly
                    </span>
                  </div>
                </div>
              </div>
            </FeatureCard>

            {/* 8. Entity Mention Highlighting */}
            <FeatureCard
              icon={Sparkles}
              title="Highlighted Entity References"
              description="View the full document text and filter by mentions of your entity, highlighted for ease of reference."
            >
              <div className="space-y-2 text-xs">
                <div className="flex gap-1">
                  {["Info", "Decisions", "Activity", "Paragraphs"].map(
                    (tab, i) => (
                      <span
                        key={tab}
                        className={`rounded-t px-2 py-1 text-[10px] font-medium ${i === 3 ? "bg-white text-gray-700" : "text-gray-400"}`}
                      >
                        {tab}
                      </span>
                    ),
                  )}
                </div>
                <div className="rounded p-2 text-gray-600">
                  <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-un-blue text-[8px] text-white">
                    1
                  </span>
                  Requests the Secretary-General to ensure that{" "}
                  <strong className="text-gray-900">OIOS</strong> has adequate
                  resources...
                </div>
                <button className="flex items-center gap-1 text-[10px] text-gray-400">
                  <ChevronDown className="h-3 w-3 -rotate-90" />
                  Show 5 paragraphs not mentioning OIOS
                </button>
              </div>
            </FeatureCard>

            {/* 9. At-a-Glance Citation Age */}
            <FeatureCard
              icon={FileText}
              title="At-a-Glance Mandate Age"
              description="Color-coded indicators show a mandate's age, helping you prioritize which citations may need review or updating."
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600">2024</span>
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                    &lt;5
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600">2018</span>
                  <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600">
                    &gt;5
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600">2010</span>
                  <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
                    &gt;10
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600">1998</span>
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                    &gt;20
                  </span>
                </div>
              </div>
            </FeatureCard>

            {/* 10. Proactive Issue Detection */}
            <FeatureCard
              icon={Sparkles}
              title="Issue Detection and Rectification"
              description="The platform detects potential issues: missing metadata, unavailable PDF links, or newer versions already cited and suggests a recommended action to rectify a potential issue."
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-2 py-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs">
                    ?
                  </span>
                  <span className="text-xs text-amber-700">
                    Document not found in UN Library
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs">
                    ×
                  </span>
                  <span className="text-xs text-red-700">
                    Newer version already cited
                  </span>
                </div>
              </div>
            </FeatureCard>

            {/* 11. Never Miss an Updated Resolution */}
            <FeatureCard
              icon={Sparkles}
              title="Never Miss an Updated Mandate"
              description="Newer mandate citations are identified automatically. Smart alerts allow you to update to the latest version, where appropriate."
            >
              <div className="space-y-2">
                <MockWarning
                  icon="↑"
                  text="Newer version available: A/RES/79/19"
                />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Current:</span>
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 font-medium text-gray-600">
                    A/RES/78/20 (2023)
                  </span>
                  <ArrowRight className="h-3 w-3 text-gray-400" />
                  <span className="rounded bg-un-blue/10 px-1.5 py-0.5 font-medium text-un-blue">
                    A/RES/79/19 (2024)
                  </span>
                </div>
              </div>
            </FeatureCard>

            {/* 12. Compare Document Versions */}
            <FeatureCard
              icon={ArrowLeftRight}
              title="Compare Document Versions"
              description="Not sure what changed? Use the built-in comparison viewer to see what text was added, removed, or modified between document versions."
            >
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="space-y-1.5">
                  <div className="text-center font-medium text-gray-500">
                    A/RES/78/20
                  </div>
                  <div className="rounded p-2 text-gray-600">
                    <span className="bg-red-200 text-red-800">Calls upon</span>{" "}
                    all States to refrain from...
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-center font-medium text-gray-500">
                    A/RES/79/19
                  </div>
                  <div className="rounded p-2 text-gray-600">
                    <span className="bg-green-200 text-green-800">Urges</span>{" "}
                    all States to refrain from...
                  </div>
                  <div className="rounded bg-green-100 p-2 text-green-800">
                    Reaffirms the importance of transparency
                  </div>
                </div>
              </div>
            </FeatureCard>

            {/* 13. Discover Shared Citations */}
            <FeatureCard
              icon={Users}
              title="View Cross-entity Mandate Citations"
              description="View which entities cite a mandate to inform potential discussion and coordination among entities."
            >
              <div className="flex flex-wrap gap-1.5">
                {["DPPA 12", "DPO 8", "OHCHR 5", "OIOS 4"].map((e) => (
                  <span
                    key={e}
                    className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600"
                  >
                    {e}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-un-blue">
                Showing 12 mandates shared with DPPA
              </div>
            </FeatureCard>

            {/* 14. Foundational Mandates */}
            <FeatureCard
              icon={Star}
              title="Foundational and Background Mandates"
              description="Mandates cited in the Mandates and Background are marked with a star for easy identification."
            >
              <div className="flex items-center gap-2">
                <Star
                  className="h-4 w-4 fill-un-blue text-un-blue"
                  strokeWidth={0.5}
                />
                <span className="text-xs text-gray-600">
                  A/RES/48/218 B is also cited in Mandates and Background
                </span>
              </div>
            </FeatureCard>

            {/* 15. Magic Link Sign-In */}
            <FeatureCard
              icon={Mail}
              title="Magic Link Sign-In"
              description="Sign in with your UN email—we'll send you a secure link. You can also invite colleagues to collaborate on the submission."
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-400">
                  your.name@un.org
                </div>
                <button className="rounded-lg bg-un-blue px-3 py-2 text-xs font-medium text-white">
                  Send link
                </button>
              </div>
            </FeatureCard>

            {/* 16. Export Your Data */}
            <FeatureCard
              icon={Download}
              title="Export Your Data"
              description="Export mandate citations in CSV, Excel, or Word formats. The Word files are formatted in line with publication standards for seamless integration into the 2027 PPB (Programme Plan)."
            >
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                  <Download className="h-3 w-3" />
                  Export
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
                <div className="flex gap-1 text-[10px] text-gray-400">
                  <span className="rounded bg-gray-200 px-1.5 py-0.5">CSV</span>
                  <span className="rounded bg-gray-200 px-1.5 py-0.5">
                    Excel
                  </span>
                  <span className="rounded bg-gray-200 px-1.5 py-0.5">
                    Word
                  </span>
                </div>
              </div>
            </FeatureCard>
          </div>
        </section>

        {/* Getting Started */}
        <section className="border-t border-gray-200 bg-gray-50 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <h3 className="mb-8 text-2xl font-bold text-gray-900">
              Get Started in 3 Steps
            </h3>
            <div className="grid gap-8 md:grid-cols-3">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-un-blue text-lg font-bold text-white">
                  1
                </div>
                <h4 className="mb-2 font-semibold text-gray-900">Sign In</h4>
                <p className="text-sm text-gray-600">
                  Enter your UN email and click the magic link sent to your
                  email.
                </p>
              </div>
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-un-blue text-lg font-bold text-white">
                  2
                </div>
                <h4 className="mb-2 font-semibold text-gray-900">
                  Find Your Entity
                </h4>
                <p className="text-sm text-gray-600">
                  Search or browse to your entity&apos;s mandate list.
                </p>
              </div>
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-un-blue text-lg font-bold text-white">
                  3
                </div>
                <h4 className="mb-2 font-semibold text-gray-900">
                  Update Citations
                </h4>
                <p className="text-sm text-gray-600">
                  Record whether each mandate is retained, updated or removed
                  with a reason.
                </p>
              </div>
            </div>
            <Link
              href={ctaHref}
              className="mt-10 inline-flex items-center gap-2 rounded-lg bg-un-blue px-6 py-3 font-medium text-white transition-colors hover:bg-un-blue/90"
            >
              {isLoggedIn ? "Go to Dashboard" : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
