import { SubmissionCycleControl } from "@/features/mandates/ui/SubmissionCycleControl";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Header } from "@/components/core/Header";
import { FooterFootnote } from "@/components/core/FooterFootnote";
import { getCurrentUser } from "@/features/auth/auth";
import { fetchEntities } from "@/features/mandates/services/data-service";
import { fetchAnalysisData } from "@/features/mandates/services/analysis-service";
import { AnalysisDashboard } from "./AnalysisDashboard";

export const metadata = {
  title: "Analysis | Mandate Housekeeping Platform",
  description: "Decision distribution and citation impact analysis",
};

export default async function AnalysisPage() {
  const user = await getCurrentUser();

  // Only reviewers can access this page
  if (!user?.isReviewer) {
    redirect("/");
  }

  const [entities, analysisData] = await Promise.all([
    fetchEntities(),
    fetchAnalysisData(),
  ]);

  return (
    <>
      <Header user={user} entities={entities} />
      <main className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-4">
        <SubmissionCycleControl />
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-un-blue">Analytics</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
              Decision Analysis
            </h1>
            <p className="mt-2 text-base text-gray-500">
              Overview of mandate decisions and their projected impact on
              citation counts
            </p>
          </div>
          <a
            href="/api/export/analysis"
            download
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export data
          </a>
        </div>
        <AnalysisDashboard data={analysisData} />
      </main>
      <FooterFootnote />
    </>
  );
}
