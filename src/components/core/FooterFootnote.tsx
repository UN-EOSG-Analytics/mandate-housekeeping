import { getBudgetVersion } from "@/lib/db/review-cycle";
export async function FooterFootnote() {
  const version = await getBudgetVersion();
  return (
    <div className="mx-auto mt-8 w-full max-w-7xl px-3 sm:px-4">
      <p className="pb-6 text-xs text-gray-400">
        <sup>*</sup> All current mandate citations have been extracted from the{" "}
        {version === "ppb2027" ? (
          <span>
            imported Programme Budget 2027 and associated budget documents
          </span>
        ) : (
          <a
            href="https://www.un.org/en/ga/fifth/80/ppb2026.shtml"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-un-blue"
          >
            List of documents relating to the proposed programme plan and budget
            for 2026
          </a>
        )}
        .
        <br />
        Only showing parts, sections, and entities that include
        &apos;Legislative mandates&apos;.
      </p>
    </div>
  );
}
