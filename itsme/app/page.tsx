import { PageCanvas } from "@/components/page-canvas";
import { SAMPLE_RESUME } from "@/components/page-canvas";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="w-full h-full max-w-lg">
        <PageCanvas document={SAMPLE_RESUME} dpi={12} />
      </div>
    </div>
  );
}
