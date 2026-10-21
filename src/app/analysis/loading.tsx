import { Header } from "@/components/core/Header";

/** Analysis routes retain navigation feedback without the global page message. */
export default function AnalysisLoading() {
  return (
    <>
      <Header navigationPending />
      <main
        className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-4"
        aria-busy="true"
      >
        <p role="status" className="sr-only">
          Loading analysis
        </p>
        <div
          aria-hidden="true"
          className="animate-pulse space-y-6 motion-reduce:animate-none"
        >
          <div className="h-8 w-64 rounded bg-gray-200" />
          <div className="h-4 w-3/4 max-w-2xl rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-96 rounded-lg border border-gray-200 bg-gray-50" />
        </div>
      </main>
    </>
  );
}
