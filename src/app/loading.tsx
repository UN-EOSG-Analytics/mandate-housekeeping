import { typography } from "@un-eosg/ui/typography";

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-4"
      aria-busy="true"
    >
      <p role="status" className={typography.body}>
        Loading page…
      </p>
    </main>
  );
}
