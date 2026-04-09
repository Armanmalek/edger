import { Suspense } from "react";
import { EdgesGame } from "@/components/EdgesGame";

export default function Page() {
  return (
    <Suspense fallback={<main>Loading Edges…</main>}>
      <EdgesGame />
    </Suspense>
  );
}
